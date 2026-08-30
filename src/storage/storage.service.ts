/* eslint-disable prettier/prettier */
import { BadRequestException, Injectable, InternalServerErrorException, Logger, NotFoundException, NotImplementedException, OnModuleInit } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { StorageFile } from 'src/schemas/storage-file.schema';
import { SupabaseService } from 'src/supabase/supabase.service';
import { DevicesDB } from 'src/devices/devices.db';
import { EventsGateway } from 'src/events/events.gateway';
import { PaginationResponse, ReqQuery } from 'src/types/request.interface';
import { TailscaleDevice } from 'src/types/tailscale.interface';
import { OneSignal } from 'src/utils/onesignal';
import { Cron, CronExpression } from '@nestjs/schedule';
import { runCommandSpawn } from 'src/utils/shell';
import path from 'node:path';
import { lstat, readFile, rm, writeFile } from 'node:fs/promises';
import { fileTypeFromBuffer, fileTypeFromFile } from 'file-type';

@Injectable()
export class StorageService implements OnModuleInit {
  private readonly logger = new Logger(StorageService.name);
  private readonly FIFTY_MB_IN_BYTES = 50 * 1024 * 1024;

  constructor (
    private readonly supabaseService: SupabaseService,
    @InjectModel(StorageFile.name) private storageFileModel: Model<StorageFile>,
    private readonly devicesDb: DevicesDB,
    private readonly eventsGateway: EventsGateway,
  ) {}

  async onModuleInit() {
    const { data, error } = await this.supabaseService.createBucket();
    if (error) this.logger.debug('Supabase storage bucket creation error:', error.message);
    if (data) this.logger.debug('Supabase storage bucket created:', data.name);

    runCommandSpawn('sh', [
      './src/scripts/storage/init.sh',
    ]).then(() => this.logger.debug('Host storage init'));
  };

  // TODO: will use ReadableStream instead
  private async writeBuffer(buffer: Buffer, filePath: string, bucket: string = '/var/tsync/storage') {
    const joinedPath = path.join(bucket, filePath);
    await writeFile(joinedPath, buffer, { mode: 0o600 });
    return {
      bucket,
      path: filePath,
      fullPath: joinedPath,
    };
  };

  private async readBuffer(filePath: string, bucket: string = '/var/tsync/storage') {
    const joinedPath = path.join(bucket, filePath);
    const file = await readFile(joinedPath);
    const ft = await fileTypeFromBuffer(file.buffer);
    return {
      bucket,
      path: filePath,
      fullPath: joinedPath,
      buffer: file.buffer,
      mimetype: ft?.mime ?? 'application/octet-stream'
    };
  };

  private async deleteHostFile(filePath: string, bucket: string = '/var/tsync/storage'): Promise<boolean | null> {
    const safeFilepath = path.normalize(filePath).replace(/^(\.\.[\/\\])+/, '');
    const targetPath = path.resolve(bucket, safeFilepath);

    try {
      const stats = await lstat(targetPath);
      if (stats.isDirectory()) {
        this.logger.debug(`Target is a dir, not a file ${filePath}`);
        return null;
      }
      await rm(targetPath, { force: true });
      return true;
    } catch (error: any) {
      this.logger.error(`Host file deletion error:`, error);
      return false;
    };
  };

  async uploadFile(
    tailscaleDevice: TailscaleDevice,
    expiry: Date | null,
    file: Express.Multer.File,
    bucket?: string,
  ) {    
    if (!file) throw new BadRequestException('No file given.');
    
    const isBelow50mb = file.size < this.FIFTY_MB_IN_BYTES;

    const fileExt = file.originalname.split('.').pop();
    const filePath = `${crypto.randomUUID()}.${fileExt}`;

    let uploadPath: string = '';
    let storedIn: 'host' | 'supabase';

    if (!isBelow50mb) {
      const data = await this.writeBuffer(file.buffer, filePath);
      uploadPath = data.path;
      storedIn = 'host';
    } else {
      const { data, error } = await this.supabaseService.uploadFile(file, filePath, bucket);
      if (error || !data) {
        this.logger.error(`Supabase upload failed for file ${file.originalname}:`, error);
        throw new InternalServerErrorException('Failed to upload file to storage provider.');
      };
      uploadPath = data.path;
      storedIn = 'supabase';
    }

    const fileItem: Omit<StorageFile, 'createdAt' | 'updatedAt'> = {
      tailscaleId: tailscaleDevice.id,
      name: file.originalname,
      path: uploadPath,
      supabaseBucket: storedIn === 'supabase' ? (bucket || process.env.SUPABASE_STORAGE_BUCKET_NAME || 'tsync-storage') : undefined,
      storedIn,
      sizeBytes: file.size,
      mimetype: file.mimetype,
      expiresAt: expiry ?? undefined,
    };
    
    const upload = (await this.storageFileModel.create(fileItem)).toObject();
    if (!upload._id) {
      void this.supabaseService.deleteFile(uploadPath);
      throw new InternalServerErrorException('Failed to upload file to storage provider.');
    }

    this.logger.debug('File uploaded', upload);
    const returnObj = this.stripFile(upload);

    void (async () => {
      this.eventsGateway.server.emit('storage', 'upload', returnObj);

      const devices = await this.devicesDb.findAll() || [];
      const ids: string[] = [];
      devices.forEach((d) => {
        if (d.id !== upload.tailscaleId) ids.push(d.id);
      });
      void OneSignal.create()
        .title('STORAGE UPLOAD')
        .message(returnObj.name)
        .data({
          type: 'STORAGE_UPLOAD',
          data: returnObj,
        })
        .rest({
          priority: 10,
        })
        .userIds(ids)
        .sendPush({
          isImportant: true,
        })
        .then((n) => n.sendToNtfy());
    })();
    
    return returnObj;
  };

  async getFilesList(query: ReqQuery & { search?: string }): Promise<{ data: Omit<StorageFile, 'path' | 'storedIn' | 'supabaseBucket'>[], pagination: PaginationResponse }> {
    const page = Number(query.page || 1);
    const limit = Number(query.limit || 20);

    const skip = (page * limit) - limit;

    const filter = {
      name: {
        $regex: query.search || '', $options: 'i',
      },
    };

    const [data, total] = await Promise.all([
      this.storageFileModel.find(filter).sort({ updatedAt: -1 }).skip(skip).limit(limit),

      this.storageFileModel.countDocuments(),
    ]);

    const hasNext = (total / limit) > page;

    return {
      data: data.map((d) => this.stripFile(d)),
      pagination: {
        total,
        page,
        limit,
        hasNext,
        hasPrev: page > 1,
      },
    };
  };

  async downloadFile(id: string) {
    const storedFileInfo = (await this.storageFileModel.findById(id))?.toObject();

    if (!storedFileInfo) {
      throw new NotFoundException(`File with ID: ${id} was not found.`);
    };

    let buffer: Buffer<ArrayBuffer>;
    let mimetype: string = 'application/octet-stream';

    if (storedFileInfo.storedIn === 'host') {
      const read = await this.readBuffer(storedFileInfo.path);
      buffer = Buffer.from(read.buffer);
      mimetype = read.mimetype;
    } else {
      const { data: supabaseData, error } = await this.supabaseService.downloadFile(storedFileInfo.path);
      if (error || !supabaseData) {
        this.logger.error(`Supabase download failed for path ${storedFileInfo.path}:`, error);
        throw new InternalServerErrorException('Failed to get file from storage provider.');
      }

      buffer = Buffer.from(await supabaseData.arrayBuffer());
      mimetype = supabaseData.type;
    };

    return {
      buffer,
      fileName: storedFileInfo.name,
      mimetype,
    };
  };

  async deleteFile(id: string) {
    const storedFileInfo = (await this.storageFileModel.findById(id))?.toObject();

    if (!storedFileInfo) {
      throw new NotFoundException(`File with ID: ${id} was not found.`);
    };

    let didFail: boolean = false;

    if (storedFileInfo.storedIn === 'host') {
      const delRes = await this.deleteHostFile(storedFileInfo.path);

      if (!delRes) didFail = true;
    } else {
      const { data, error } = await this.supabaseService.deleteFile(storedFileInfo.path, storedFileInfo.supabaseBucket);

      if (error || !data) {
        this.logger.error(`Supabase delete failed for path ${storedFileInfo.path}:`, error);
        didFail = true;
      };
    };

    if (didFail) throw new InternalServerErrorException('Failed to delete file from storage provider.');

    await this.storageFileModel.findByIdAndDelete(id);

    this.eventsGateway.server.emit('storage', 'delete', id);
  };

  private stripFile(d: StorageFile & { _id: Types.ObjectId }) {
    return {
      _id: d._id,
      tailscaleId: d.tailscaleId,
      name: d.name,
      sizeBytes: d.sizeBytes,
      mimetype: d.mimetype,
      expiresAt: d.expiresAt,
      createdAt: d.createdAt,
      updatedAt: d.updatedAt,
    };
  };

  @Cron(CronExpression.EVERY_3_HOURS)
  async storageCleanup() {
    const now = new Date();

    try {
      const query = { expiresAt: { $lte: now } };
      const files = await this.storageFileModel.find(query).lean();
      if (files.length < 1) {
        this.logger.debug('No files to cleanup');
        return;
      };

      const successfulFiles: StorageFile[] = [];
      const hostFiles: StorageFile[] = [];
      const spBuckets = new Map<string, StorageFile[]>();

      const emitDeletionViaSocket = (file: StorageFile) => {
        const id = (file as StorageFile & { _id: string })?._id;
        if (!id) return;
        this.eventsGateway.server.emit('storage', 'delete', String(id));
      };

      for (const f of files) {
        if (f.storedIn === 'host') hostFiles.push(f)

        else if (f.storedIn === 'supabase') {
          const bucket = f?.supabaseBucket || process.env.SUPABASE_STORAGE_BUCKET_NAME || 'tsync-storage';
          const existing = spBuckets.get(bucket) || [];
          existing.push(f);
          spBuckets.set(bucket, existing);
        }
      };

      if (hostFiles.length > 0) await Promise.allSettled(hostFiles.map(async (hF) => {
        try {
          const ok = await this.deleteHostFile(hF.path);
          if (ok) {
            successfulFiles.push(hF);
            emitDeletionViaSocket(hF);
          } else {
            this.logger.error(`Failed to delete host file: ${hF.path}`);
          }
        } catch (error) {
          this.logger.error(`Exception deleting host file ${hF.path}:`, error);
        };
      }));

      if (spBuckets.size > 0) for (const [bucketName, bucketFiles] of spBuckets.entries()) {
        try {
          const { data, error } = await this.supabaseService.deleteFileBulk(bucketFiles.map((f) => f.path), bucketName);
          if (error || !data) {
            this.logger.error(`Failed to delete ${bucketFiles.length} Supabase files in bucket: ${bucketName}`, error);
            continue;
          };

          for (const f of bucketFiles) {
            successfulFiles.push(f);
            emitDeletionViaSocket(f);
          };
        } catch (error) {
          this.logger.error(`Error during Supabase bulk delete in ${bucketName}:`, error);
        }
      };

      if (successfulFiles.length > 0) {
        const deleted = await this.storageFileModel.deleteMany({
          ...query,
          _id: {
            $in: successfulFiles.map((f) => (f as StorageFile & { _id: string })._id),
          },
        });

        this.logger.debug(`storageCleanup files cleaned: ${deleted.deletedCount}`);
      };
      this.logger.debug(`storageCleanup files failed: ${files.length - successfulFiles.length}`);
    } catch (error) {
      this.logger.error('storageCleanup error:', error);
    }
  }
}

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
import { readFile, writeFile } from 'node:fs/promises';
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

    if (storedFileInfo.storedIn === 'host') {
      throw new NotImplementedException('Host file storage method is not implemented yet.');
    };

    const { data, error } = await this.supabaseService.deleteFile(storedFileInfo.path, storedFileInfo.supabaseBucket);

    if (error) {
      this.logger.error(`Supabase delete failed for path ${storedFileInfo.path}:`, error);
      throw new InternalServerErrorException('Failed to delete file from storage provider.');
    }

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
      const hostFiles: StorageFile[] = []; // TODO
      const supabaseFiles: StorageFile[] = [];
      files.forEach((f) => {
        if (f.storedIn === 'host') hostFiles.push(f);
        if (f.storedIn === 'supabase') supabaseFiles.push(f);
      });

      for (const sF of supabaseFiles) {
        const { error } = await this.supabaseService.deleteFile(sF.path, sF.supabaseBucket);
        if (!error) {
          successfulFiles.push(sF);
          const fileId = String((sF as StorageFile & { _id: string })._id);
          this.eventsGateway.server.emit('storage', 'delete', fileId);
        } else {
          this.logger.error(`Failed to delete Supabase file ${sF.path}:`, error);
        };
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

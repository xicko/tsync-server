/* eslint-disable prettier/prettier */
import { BadRequestException, Injectable, InternalServerErrorException, Logger, NotFoundException, NotImplementedException, OnModuleInit } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import 'multer';
import { StorageFile } from 'src/schemas/storage-file.schema';
import { SupabaseService } from 'src/supabase/supabase.service';
import { DevicesDB } from 'src/devices/devices.db';
import { EventsGateway } from 'src/events/events.gateway';
import { PaginationResponse, ReqQuery } from 'src/types/request.interface';
import { TailscaleDevice } from 'src/types/tailscale.interface';

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
  };

  async uploadFile(
    tailscaleDevice: TailscaleDevice,
    file: Express.Multer.File,
    bucket?: string,
  ) {
    if (!file) throw new BadRequestException('No file given.');
    
    const isBelow50mb = file.size < this.FIFTY_MB_IN_BYTES;

    if (!isBelow50mb) {
      // TODO
      this.logger.debug(`Diff: ${file.size - this.FIFTY_MB_IN_BYTES}`);
      throw new NotImplementedException('Uploads above 50mb are not implemented.');
    };

    const fileExt = file.originalname.split('.').pop();
    const filePath = `${crypto.randomUUID()}.${fileExt}`;

    const { data, error } = await this.supabaseService.uploadFile(file, filePath, bucket);
    if (error || !data) {
      this.logger.error(`Supabase upload failed for file ${file.originalname}:`, error);
      throw new InternalServerErrorException('Failed to upload file to storage provider.');
    };

    const fileItem: Omit<StorageFile, 'createdAt' | 'updatedAt'> = {
      tailscaleId: tailscaleDevice.id,
      name: file.originalname,
      path: data.path,
      supabaseBucket: bucket || process.env.SUPABASE_STORAGE_BUCKET_NAME || 'tsync-storage',
      storedIn: 'supabase',
      sizeBytes: file.size,
      mimetype: file.mimetype,
    };
    
    const upload = (await this.storageFileModel.create(fileItem)).toObject();
    if (!upload._id) {
      void this.supabaseService.deleteFile(data.path);
      throw new InternalServerErrorException('Failed to upload file to storage provider.');
    }

    this.logger.debug('File uploaded', upload);
    const returnObj = this.stripFile(upload);
    this.eventsGateway.server.emit('storage', 'upload', returnObj);
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

    if (storedFileInfo.storedIn === 'host') {
      throw new NotImplementedException('Host file storage method is not implemented yet.');
    };

    const { data, error } = await this.supabaseService.downloadFile(storedFileInfo.path);

    if (error || !data) {
      this.logger.error(`Supabase download failed for path ${storedFileInfo.path}:`, error);
      throw new InternalServerErrorException('Failed to get file from storage provider.');
    }

    const buffer = Buffer.from(await data.arrayBuffer());

    return {
      buffer,
      fileName: storedFileInfo.name,
      mimeType: data.type || 'application/octet-stream',
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
      createdAt: d.createdAt,
      updatedAt: d.updatedAt,
    };
  };
}

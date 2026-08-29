import { Injectable, Logger } from "@nestjs/common";
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import '@supabase/storage-js';
import 'multer';

@Injectable()
export class SupabaseService {
  private readonly logger = new Logger(SupabaseService.name);
  private readonly FIFTY_MB_IN_BYTES = 52428800;

  private supabase: SupabaseClient;

  constructor () {
    this.supabase = createClient(
      process.env.SUPABASE_URL!,
      process.env.SUPABASE_SECRET_KEY!,
    );
  }

  async createBucket(name: string = process.env.SUPABASE_STORAGE_BUCKET_NAME || 'tsync-storage') {
    return await this.supabase.storage.createBucket(
      name,
      {
        public: false,
        type: 'STANDARD',
        fileSizeLimit: this.FIFTY_MB_IN_BYTES,
      },
    );
  }

  async uploadFile(
    file: Express.Multer.File,
    filePath: string,
    bucket: string = process.env.SUPABASE_STORAGE_BUCKET_NAME || 'tsync-storage'
  ) {
    return await this.supabase.storage
      .from(bucket)
      .upload(filePath, file.buffer, {
        contentType: file.mimetype,
        upsert: false,
      });
  }

  async downloadFile(
    name: string,
    bucket: string = process.env.SUPABASE_STORAGE_BUCKET_NAME || 'tsync-storage'
  ) {
    return await this.supabase.storage.from(bucket).download(name);
  }

  async deleteFile(
    path: string,
    bucket: string = process.env.SUPABASE_STORAGE_BUCKET_NAME || 'tsync-storage'
  ) {
    return await this.supabase.storage
      .from(bucket)
      .remove([path]);
  }

  async deleteFileBulk(
    paths: string[],
    bucket: string = process.env.SUPABASE_STORAGE_BUCKET_NAME || 'tsync-storage'
  ) {
    return await this.supabase.storage
      .from(bucket)
      .remove(paths);
  }
}

import { Module, Global } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { StorageService } from './storage.service';
import { StorageController } from './storage.controller';
import { SupabaseService } from 'src/supabase/supabase.service';
import { EventsGateway } from 'src/events/events.gateway';
import { StorageFile, StorageFileSchema } from 'src/schemas/storage-file.schema';

@Global()
@Module({
  imports: [
    MongooseModule.forFeature([
      { name: StorageFile.name, schema: StorageFileSchema },
    ]),
  ],
  controllers: [StorageController],
  providers: [StorageService,  SupabaseService, EventsGateway],
  exports: [StorageService],
})
export class StorageModule {}

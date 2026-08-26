import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { EventsModule } from './events/events.module';
import { TelegramModule } from './telegram/telegram.module';
import { AdbModule } from './adb/adb.module';
import { DevicesModule } from './devices/devices.module';
import { ScheduleModule } from '@nestjs/schedule';
import { TasksService } from './tasks/tasks.service';
import { MongooseModule } from '@nestjs/mongoose';
import { SheetRow, SheetRowSchema } from './schemas/sheet-row.schema';
import { CronConfig, CronConfigSchema } from './schemas/cron-config.schema';
import { CronLog, CronLogSchema } from './schemas/cron-log.schema';
import { CronsController } from './crons/crons.controller';
import { NotificationsSyncModule } from './notifications-sync/notifications-sync.module';
import * as dotenv from 'dotenv';
import {
  NotificationsSyncLog,
  NotificationsSyncLogSchema,
} from './schemas/notifications-sync-log.schema';
import { SettingsModule } from './global/settings/settings.module';
import { SupabaseService } from './supabase/supabase.service';
import { StorageModule } from './storage/storage.module';
import { StorageFile, StorageFileSchema } from './schemas/storage-file.schema';

dotenv.config();

@Module({
  imports: [
    NotificationsSyncModule,
    EventsModule,
    TelegramModule,
    AdbModule,
    DevicesModule,
    SettingsModule,
    StorageModule,
    ScheduleModule.forRoot(),
    MongooseModule.forRoot(process.env.MONGO_URI || '', {
      dbName: process.env.DB_NAME,
    }),
    MongooseModule.forFeature([
      { name: SheetRow.name, schema: SheetRowSchema },
      { name: CronConfig.name, schema: CronConfigSchema },
      { name: CronLog.name, schema: CronLogSchema },
      { name: NotificationsSyncLog.name, schema: NotificationsSyncLogSchema },
    ]),
  ],
  controllers: [AppController, CronsController],
  providers: [AppService, TasksService, SupabaseService],
  exports: [MongooseModule],
})
export class AppModule {}

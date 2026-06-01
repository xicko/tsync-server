import { Module, Global } from '@nestjs/common';
import { NotificationsSyncService } from './notifications-sync.service';
import { NotificationsSyncController } from './notifications-sync.controller';
import { MongooseModule } from '@nestjs/mongoose';
import { NotificationsSyncLogSchema } from 'src/schemas/notifications-sync-log.schema';

@Global()
@Module({
  imports: [
    MongooseModule.forFeature([
      { name: 'NotificationsSyncLog', schema: NotificationsSyncLogSchema },
    ]),
  ],
  controllers: [NotificationsSyncController],
  providers: [NotificationsSyncService],
  exports: [NotificationsSyncService],
})
export class NotificationsSyncModule {}

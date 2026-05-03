import { Module, Global } from '@nestjs/common';
import { NotificationsSyncService } from './notifications-sync.service';
import { NotificationsSyncController } from './notifications-sync.controller';

@Global()
@Module({
  controllers: [NotificationsSyncController],
  providers: [NotificationsSyncService],
  exports: [NotificationsSyncService],
})
export class NotificationsSyncModule {}

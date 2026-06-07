import { Module, Global } from '@nestjs/common';
import { NotificationsSyncService } from './notifications-sync.service';
import { NotificationsSyncController } from './notifications-sync.controller';
import { MongooseModule } from '@nestjs/mongoose';
import { NotificationsSyncLogSchema } from 'src/schemas/notifications-sync-log.schema';
import { EventsModule } from 'src/events/events.module';
import { NotificationsSyncDenylistSchema } from 'src/schemas/notifications-sync-denylist.schema';

@Global()
@Module({
  imports: [
    MongooseModule.forFeature([
      { name: 'NotificationsSyncLog', schema: NotificationsSyncLogSchema },
    ]),
    MongooseModule.forFeature([
      {
        name: 'NotificationsSyncDenylist',
        schema: NotificationsSyncDenylistSchema,
      },
    ]),
    EventsModule,
  ],
  controllers: [NotificationsSyncController],
  providers: [NotificationsSyncService],
  exports: [NotificationsSyncService],
})
export class NotificationsSyncModule {}

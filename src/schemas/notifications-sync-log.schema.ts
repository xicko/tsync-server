/* eslint-disable prettier/prettier */
import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';
import type { CollectedNotificationAndroidData, CollectedNotificationWindowsData } from 'src/notifications-sync/types/notifications-sync.interface';

export type NotificationsSyncLogDocument = HydratedDocument<NotificationsSyncLog>;

@Schema({ timestamps: true })
export class NotificationsSyncLog {
  @Prop({ required: true })
  type: 'android' | 'windows';

  @Prop({ required: false })
  android: CollectedNotificationAndroidData;

  @Prop({ required: false })
  windows: CollectedNotificationWindowsData;

  createdAt: Date;
  updatedAt: Date;
}

export const NotificationsSyncLogSchema = SchemaFactory.createForClass(NotificationsSyncLog);

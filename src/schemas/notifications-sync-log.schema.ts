/* eslint-disable prettier/prettier */
import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';
import type { CollectedNotificationAndroidData } from 'src/notifications-sync/types/notifications-sync.interface';

export type NotificationsSyncLogDocument = HydratedDocument<NotificationsSyncLog>;

@Schema({ timestamps: true })
export class NotificationsSyncLog {
  @Prop({ required: true, type: String, enum: ['android'] })
  type: 'android';

  @Prop({ required: true, type: String })
  tailscaleId: string;

  @Prop({ required: true, type: Number })
  timestamp: number; // sent from client

  @Prop({
    required: false,
    type: {
      packageName: String,
      timestamp: Number,
      title: String,
      text: String,
      bigText: String,
      infoText: String,
      titleBig: String,
      conversationTitle: String,
      peopleList: String,
    }
  })
  android?: CollectedNotificationAndroidData;

  createdAt: Date;
  updatedAt: Date;
}

export const NotificationsSyncLogSchema = SchemaFactory.createForClass(NotificationsSyncLog);

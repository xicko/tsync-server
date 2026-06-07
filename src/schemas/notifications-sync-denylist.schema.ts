/* eslint-disable prettier/prettier */
import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

export type NotificationsSyncDenylistDocument = HydratedDocument<NotificationsSyncDenylist>;

@Schema({ timestamps: true })
export class NotificationsSyncDenylist {
  @Prop({ required: true, type: String, enum: ['text', 'packageIdentifier'] })
  type: 'text' | 'packageIdentifier';

  @Prop({ required: false, type: String })
  tailscaleId: string;

  @Prop({ required: false, type: String })
  text: string;

  @Prop({ required: false, type: String })
  packageIdentifier: string;

  createdAt: Date;
  updatedAt: Date;
}

export const NotificationsSyncDenylistSchema = SchemaFactory.createForClass(NotificationsSyncDenylist);

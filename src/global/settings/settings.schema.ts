/* eslint-disable prettier/prettier */
import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';
import type { GlobalAlertSettings } from './alert/alert.interface';

export type SettingsDocument = HydratedDocument<Settings>;

@Schema({ timestamps: true })
export class Settings {
  @Prop({ type: String, required: true })
  _id: string;

  @Prop({ type: Object, default: {} })
  alert: GlobalAlertSettings;

  createdAt: Date;
  updatedAt: Date;
}

export const SettingsSchema = SchemaFactory.createForClass(Settings);

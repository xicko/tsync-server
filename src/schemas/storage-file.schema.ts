/* eslint-disable prettier/prettier */
import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

export type StorageFileDocument = HydratedDocument<StorageFile>;

@Schema({ timestamps: true })
export class StorageFile {
  @Prop({ required: true, type: String, enum: ['host', 'supabase'] })
  storedIn!: 'host' | 'supabase';

  @Prop({ required: true, type: String })
  tailscaleId!: string;

  @Prop({ required: true, type: String })
  name!: string;

  @Prop({ required: true, type: String })
  path!: string;

  @Prop({ required: false, type: String })
  supabaseBucket?: string;

  @Prop({ required: true, type: Number })
  sizeBytes!: number;

  @Prop({ required: false, type: String })
  mimetype?: string;

  @Prop({ required: false, type: Date })
  expiresAt?: Date;

  createdAt: Date;
  updatedAt: Date;
}

export const StorageFileSchema = SchemaFactory.createForClass(StorageFile);

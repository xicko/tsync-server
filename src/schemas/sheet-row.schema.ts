import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

export type SheetRowDocument = HydratedDocument<SheetRow>;

@Schema({ timestamps: true })
export class SheetRow {
  @Prop({ required: true, unique: true, index: true })
  id: string;

  @Prop({ required: true })
  date: string;

  @Prop({ required: true })
  project: string;

  @Prop({ required: true })
  description: string;

  @Prop({ required: true })
  startTime: string;

  @Prop({ required: true })
  endTime: string;

  /** SHA-256 of the serialised row — stored for reference */
  @Prop({ required: true })
  _hash: string;
}

export const SheetRowSchema = SchemaFactory.createForClass(SheetRow);

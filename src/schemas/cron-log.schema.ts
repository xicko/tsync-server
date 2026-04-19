import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

export type CronLogDocument = HydratedDocument<CronLog>;

@Schema({ timestamps: true })
export class CronLog {
  @Prop({ required: true })
  name: string;

  @Prop({ required: true })
  status: 'SUCCESS' | 'FAILED';

  @Prop()
  output?: string;

  @Prop({ required: true })
  durationMs: number;

  createdAt?: Date;
  updatedAt?: Date;
}

export const CronLogSchema = SchemaFactory.createForClass(CronLog);

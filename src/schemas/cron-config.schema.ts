import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

export type CronConfigDocument = HydratedDocument<CronConfig>;

@Schema({ timestamps: true })
export class CronConfig {
  @Prop({ required: true, unique: true })
  name: string;

  @Prop({
    required: true,
    enum: ['SHEETS', 'REMINDER', 'COUNT', 'HEALTHCHECK'],
  })
  type: string;

  @Prop({ required: true })
  cronExpression: string;

  @Prop({ type: Object, default: {} })
  data: Record<string, any>;

  @Prop({ default: true })
  isActive: boolean;

  createdAt?: Date;
  updatedAt?: Date;
}

export const CronConfigSchema = SchemaFactory.createForClass(CronConfig);

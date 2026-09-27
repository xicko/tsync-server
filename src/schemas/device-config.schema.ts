import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

export type DeviceConfigDocument = HydratedDocument<DeviceConfig>;

export interface DeviceAdbConfig {
  port?: number;
}

export interface DeviceAndroidConfig {
  adb?: DeviceAdbConfig;
}

export interface DeviceWindowsConfig {
  macAddress?: string;
}

export interface DeviceConfigUpdate {
  batterySync?: boolean;
  androidConfig?: { adb?: { port?: number | null } };
  windowsConfig?: { macAddress?: string | null };
}

@Schema({ timestamps: true })
export class DeviceConfig {
  @Prop({ type: String, required: true })
  _id: string;

  @Prop({ type: Boolean, default: true })
  batterySync: boolean;

  @Prop({ type: Object, default: {} })
  androidConfig: DeviceAndroidConfig;

  @Prop({ type: Object, default: {} })
  windowsConfig: DeviceWindowsConfig;

  createdAt: Date;
  updatedAt: Date;
}

export const DeviceConfigSchema = SchemaFactory.createForClass(DeviceConfig);

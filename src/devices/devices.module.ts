import { Module, Global } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { DevicesService } from './devices.service';
import { DevicesController } from './devices.controller';
import { DevicesDB } from './devices.db';
import {
  DeviceConfig,
  DeviceConfigSchema,
} from '../schemas/device-config.schema';

@Global()
@Module({
  imports: [
    MongooseModule.forFeature([
      { name: DeviceConfig.name, schema: DeviceConfigSchema },
    ]),
  ],
  controllers: [DevicesController],
  providers: [DevicesService, DevicesDB],
  exports: [DevicesService, DevicesDB],
})
export class DevicesModule {}

import { Module, Global } from '@nestjs/common';
import { DevicesService } from './devices.service';
import { DevicesController } from './devices.controller';
import { DevicesDB } from './devices.db';

@Global()
@Module({
  controllers: [DevicesController],
  providers: [DevicesService, DevicesDB],
  exports: [DevicesService, DevicesDB],
})
export class DevicesModule {}

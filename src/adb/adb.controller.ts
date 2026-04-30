import { Body, Controller, Get, Param, Patch } from '@nestjs/common';
import { AdbService } from './adb.service';

@Controller('adb')
export class AdbController {
  constructor(private readonly adbService: AdbService) {}

  @Get('/connected')
  async getConnectedAdbDevices() {
    return await this.adbService.getConnectedAdbDevices();
  }

  @Patch('/devices/:tailscaleId/identifier')
  async setAdbDeviceIdentifier(
    @Param('tailscaleId') tailscaleId: string,
    @Body() body: { identifier: number },
  ) {
    return await this.adbService.setAdbDeviceIdentifier(
      tailscaleId,
      body.identifier,
    );
  }
}

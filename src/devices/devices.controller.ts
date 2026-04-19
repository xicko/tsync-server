import { Body, Controller, Get, Param, Patch, Post, Req } from '@nestjs/common';
import { DevicesService } from './devices.service';
import type { Request } from 'express';

@Controller('devices')
export class DevicesController {
  constructor(private readonly devicesService: DevicesService) {}

  @Get('/')
  async getDevices(@Req() req: Request) {
    return await this.devicesService.getDevices(req);
  }

  @Post('/:tailscaleId/wol')
  async wakeOnLan(@Param('tailscaleId') tailscaleId: string) {
    return await this.devicesService.wakeOnLan(tailscaleId);
  }

  @Patch('/:tailscaleId/mac-address')
  async setWindowsMacAddress(
    @Param('tailscaleId') tailscaleId: string,
    @Body() body: { macAddress: string },
  ) {
    return await this.devicesService.setWindowsMacAddress(
      tailscaleId,
      body.macAddress,
    );
  }
}

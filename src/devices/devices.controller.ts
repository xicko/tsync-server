/* eslint-disable prettier/prettier */
import { Body, Controller, Get, Param, Patch, Post, Req, UseGuards } from '@nestjs/common';
import { DevicesService } from './devices.service';
import type { Request } from 'express';
import type { BatteryStatus } from 'src/types/tailscale.interface';
import { TailscaleDeviceIpGuard } from 'src/guards/tailscale-ip.guard';

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

  @Patch('/:tailscaleId/update-battery-status')
  @UseGuards(TailscaleDeviceIpGuard)
  async updateBatteryStatus(
    @Req() req: Request,
    @Param('tailscaleId') tailscaleId: string,
    @Body()
    body: BatteryStatus,
  ) {
    return await this.devicesService.updateBatteryStatus(
      req,
      tailscaleId,
      body,
    );
  }
}

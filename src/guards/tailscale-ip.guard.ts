/* eslint-disable prettier/prettier */
import { Injectable, CanActivate, ExecutionContext } from '@nestjs/common';
import { DevicesDB } from 'src/devices/devices.db';
import { getClientIp } from 'src/utils/network';
import type { Request } from 'express';

@Injectable()
export class TailscaleIpGuard implements CanActivate {
  constructor(private readonly devicesDb: DevicesDB) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<Request>();
    const ip = getClientIp(request);
    const isLocal = ip === '127.0.0.1' || ip === '::1' || ip === 'localhost';
    if (isLocal) return true;

    const devices = await this.devicesDb.findAll();
    if (!devices) return false;

    const acceptedIps = devices.map((d) => d.addresses[0]);
    return acceptedIps.includes(ip);
  }
}

@Injectable()
export class TailscaleDeviceIpGuard implements CanActivate {
  constructor(private readonly devicesDb: DevicesDB) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<Request>();
    const ip = getClientIp(request);

    const deviceId = (request.params.tailscaleId || request.params.deviceId) as string;
    if (!deviceId) return false;

    const device = await this.devicesDb.findOne(deviceId);
    return !!device && device.addresses[0] === ip;
  }
}

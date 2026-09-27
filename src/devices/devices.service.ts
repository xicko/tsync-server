/* eslint-disable prettier/prettier */
import {
  BadRequestException,
  ConflictException,
  HttpException,
  HttpStatus,
  Injectable,
  InternalServerErrorException,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import type { Request } from 'express';
import {
  BatteryStatus,
  TailscaleDevicesResponse,
} from '../types/tailscale.interface';
import getRedisClient from '../utils/redis';
import { getClientIp } from '../utils/network';
import { OneSignal } from '../utils/onesignal';
import { DevicesDB } from './devices.db';
import { getReadableDeviceName } from './utils/device';
import { SettingsDB } from '../global/settings/settings.db';

@Injectable()
export class DevicesService {
  private readonly logger = new Logger(DevicesService.name);

  constructor(
    private readonly devicesDb: DevicesDB,
    private readonly settingsDb: SettingsDB,
  ) {}

  async getDevices(req?: Request): Promise<TailscaleDevicesResponse> {
    let ip: string | null = null;
    if (req) ip = getClientIp(req);
    const parsed = await this.devicesDb.findAll();
    if (!parsed) return { devices: [] };

    const mod = parsed.map((device) => {
      if (ip !== null && device.addresses[0] === ip) device.isThisDevice = true;
      return device;
    });
    return { devices: mod };
  }

  async wakeOnLan(deviceId: string): Promise<void> {
    const wol = await this.settingsDb.getWol();
    if (!wol.enabled) throw new ConflictException('Wake-on-LAN is disabled globally');

    const redisClient = await getRedisClient();
    const parsed = await this.devicesDb.findAll();
    if (!parsed) throw new NotFoundException('No devices found');

    const device = parsed.find((device) => device.id === deviceId);
    if (!device) throw new NotFoundException('Device not found');
    if (!device.windowsConfig?.macAddress) throw new BadRequestException('Device has no MAC address set');

    const rawMac = device.windowsConfig.macAddress;
    const mac = String(rawMac).toLowerCase().replace(/:/g, '');

    const key = `wol:${mac}`;
    const exists = await redisClient.get(key);
    if (exists) {
      throw new HttpException(
        'Wake-on-LAN was already called recently',
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }

    const addresses = parsed.map((device) => device.addresses[0]);
    const results = await Promise.allSettled(
      addresses.map(async (address) => {
        try {
          const response = await fetch(
            `http://${address}:${wol.port}/wake`,
            {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ mac: rawMac }),
              signal: AbortSignal.timeout(3000),
            },
          );
          return response.ok;
        } catch (e) {
          this.logger.debug(e);
          return false;
        }
      }),
    );

    const anySuccess = results.some(
      (r) => r.status === 'fulfilled' && r.value === true,
    );
    if (!anySuccess) {
      this.logger.debug('wakeOnLan failed on all active nodes', { mac });
      throw new HttpException(
        'All Wake-on-LAN nodes failed',
        HttpStatus.BAD_GATEWAY,
      );
    }

    await redisClient.set(key, '1', {
      EX: 60,
      NX: true,
    });

    await OneSignal.create()
      .title('DEVICE')
      .message(`${getReadableDeviceName(device.name)} is waking up via WOL`)
      .rest({
        priority: 10,
      })
      .sendPush({ isImportant: true })
      .then((n) => n.sendToNtfy());
  }

  async setWindowsMacAddress(deviceId: string, macAddress: string) {
    const device = await this.devicesDb.findOne(deviceId);
    if (!device) throw new NotFoundException('Device not found');
    if (device.os !== 'windows') throw new BadRequestException('Device is not Windows OS');

    const updated = await this.devicesDb.updateAdditionals(deviceId, {
      windowsConfig: {
        macAddress: macAddress || undefined,
      },
    });
    if (!updated) throw new InternalServerErrorException('Failed to update MAC address');
    return updated;
  }

  async updateBatteryStatus(
    req: Request,
    deviceId: string,
    body: BatteryStatus,
  ) {
    const device = await this.devicesDb.findOne(deviceId);
    if (!device) throw new NotFoundException('Device not found');

    const isInvalid: boolean = typeof body.level !== 'number' || typeof body.isPlugged !== 'boolean';
    if (isInvalid) throw new BadRequestException('level (number) and isPlugged (boolean) are required');

    const os = device.os.toLowerCase() as 'linux' | 'android' | 'windows' | 'ios' | 'macos';

    if (os === 'android' || os === 'macos') {
      const updated = await this.devicesDb.updateAdditionals(deviceId, {
        battery: {
          timestamp: body.timestamp ?? Date.now(),
          level: body.level,
          isPlugged: body.isPlugged,
        },
      });
      if (!updated) throw new InternalServerErrorException('Failed to update battery status');
      
      return updated;
    }

    throw new BadRequestException(`Battery status is not supported for ${os}`);
  }
}

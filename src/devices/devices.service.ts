/* eslint-disable prettier/prettier */
import { Injectable, Logger } from '@nestjs/common';
import type { Request } from 'express';
import {
  BatteryStatus,
  TailscaleDevicesResponse,
} from '../types/tailscale.interface';
import getRedisClient from '../utils/redis';
import { getClientIp } from '../utils/network';
import { OneSignal } from '../utils/onesignal';
import { DevicesDB } from './devices.db';

@Injectable()
export class DevicesService {
  private readonly logger = new Logger(DevicesService.name);

  constructor(private readonly devicesDb: DevicesDB) {}

  async getDevices(req?: Request): Promise<TailscaleDevicesResponse> {
    let ip: string | null = null;
    if (req) ip = getClientIp(req);
    const parsed = await this.devicesDb.findAll();
    if (!parsed) {
      return { devices: [] };
    }
    const mod = parsed.map((device) => {
      if (ip !== null && device.addresses[0] === ip) device.isThisDevice = true;
      return device;
    });
    return { devices: mod };
  }

  async wakeOnLan(deviceId: string): Promise<{ success: boolean }> {
    const redisClient = await getRedisClient();
    const parsed = await this.devicesDb.findAll();
    if (!parsed) return { success: false };

    const device = parsed.find((device) => device.id === deviceId);
    if (!device?.windowsConfig?.macAddress) return { success: false };

    const rawMac = device.windowsConfig.macAddress;
    if (!rawMac) return { success: false };
    const mac = String(rawMac).toLowerCase().replace(/:/g, '');

    const key = `wol:${mac}`;
    const exists = await redisClient.get(key);
    if (exists) return { success: false };

    const addresses = parsed.map((device) => device.addresses[0]);
    const results = await Promise.allSettled(
      addresses.map(async (address) => {
        try {
          const response = await fetch(
            `http://${address}:${process.env.WOL_SERVICE_PORT}/wake`,
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
      return { success: false };
    }

    await redisClient.set(key, '1', {
      EX: 60,
      NX: true,
    });

    await OneSignal.create()
      .title('DEVICE')
      .message(`${device.name.split('.')[0]} is waking up via WOL`)
      .rest({
        priority: 10,
      })
      .sendPush({ isImportant: true })
      .then((n) => n.sendToNtfy());

    return { success: true };
  }

  async setWindowsMacAddress(
    deviceId: string,
    macAddress: string,
  ): Promise<{ success: boolean }> {
    try {
      const device = await this.devicesDb.findOne(deviceId);
      if (!device || device?.os !== 'windows') {
        return { success: false };
      }
      const updated = await this.devicesDb.updateAdditionals(deviceId, {
        windowsConfig: {
          macAddress: macAddress || undefined,
        },
      });
      return { success: !!updated };
    } catch (error) {
      this.logger.error(error);
      return { success: false };
    }
  }

  async updateBatteryStatus(
    req: Request,
    deviceId: string,
    body: BatteryStatus,
  ): Promise<{ success: boolean }> {
    try {
      const device = await this.devicesDb.findOne(deviceId);
      const requestIp = getClientIp(req);
      if (!device || device.addresses[0] !== requestIp) {
        return { success: false };
      }

      const os = device.os.toLowerCase() as 'linux' | 'android' | 'windows' | 'ios' | 'macos';

      if (os === 'android') {
        if (typeof body.level !== 'number' || typeof body.isPlugged !== 'boolean') return { success: false };

        const timestampMs = Date.now();
        const updated = await this.devicesDb.updateAdditionals(deviceId, {
          battery: {
            timestamp: body.timestamp ?? timestampMs,
            level: body.level,
            isPlugged: body.isPlugged,
          },
        });

        return { success: !!updated };
      }
      else if (os === 'ios') {
        // TODO
      }

      return { success: false };
    } catch (error) {
      this.logger.error(error);
      return { success: false };
    }
  }
}

/* eslint-disable prettier/prettier */
/* eslint-disable no-empty */
import { Injectable, Logger } from '@nestjs/common';
import type { Request } from 'express';
import {
  BatteryStatus,
  TailscaleDevice,
  TailscaleDevicesResponse,
} from '../types/tailscale.interface';
import getRedisClient from '../utils/redis';
import { getClientIp } from '../utils/network';
import { OneSignal } from '../utils/onesignal';

@Injectable()
export class DevicesService {
  private readonly logger = new Logger(DevicesService.name);

  async getDevices(req?: Request): Promise<TailscaleDevicesResponse> {
    let ip: string | null = null;
    if (req) ip = getClientIp(req);
    const redisClient = await getRedisClient();
    const devices = await redisClient.get('devices');
    if (!devices || typeof devices !== 'string') {
      return { devices: [] };
    }
    const parsed = JSON.parse(devices) as TailscaleDevice[];
    const mod = parsed.map((device) => {
      if (ip !== null && device.addresses[0] === ip) device.isThisDevice = true;
      return device;
    });
    return { devices: mod };
  }

  async wakeOnLan(deviceId: string): Promise<{ success: boolean }> {
    const redisClient = await getRedisClient();
    const devices = await redisClient.get('devices');
    if (!devices || typeof devices !== 'string') return { success: false };

    const parsed = JSON.parse(devices) as TailscaleDevice[];
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
      const redisClient = await getRedisClient();
      const key = `devices`;

      const devicesRaw = await redisClient.get(key);
      if (!devicesRaw || typeof devicesRaw !== 'string') {
        return { success: false };
      }
      let devices = JSON.parse(devicesRaw) as TailscaleDevice[];
      const device = devices.find((d) => d.id === deviceId);
      if (!device || device?.os !== 'windows') {
        return { success: false };
      }
      if (!device.windowsConfig) device.windowsConfig = {};
      device.windowsConfig.macAddress = macAddress || undefined;
      devices = devices.map((d) => (d.id === deviceId ? device : d));

      await redisClient.set(key, JSON.stringify(devices));
      return { success: true };
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
      const redisClient = await getRedisClient();
      const key = `devices`;

      const devicesRaw = await redisClient.get(key);
      if (!devicesRaw || typeof devicesRaw !== 'string') {
        return { success: false };
      }
      let devices = JSON.parse(devicesRaw) as TailscaleDevice[];
      const device = devices?.find((d) => d.id === deviceId) ?? null;
      const requestIp = getClientIp(req);
      if (!device || device.addresses[0] !== requestIp) {
        return { success: false };
      }

      const os = device.os.toLowerCase() as 'linux' | 'android' | 'windows' | 'ios' | 'macos';

      if (os === 'android') {
        if (typeof body.level !== 'number' || typeof body.plugged !== 'boolean') return { success: false };

        if (!device.androidConfig) device.androidConfig = {};

        const timestampMs = Date.now();
        device.androidConfig.battery = {
          timestamp: body.timestamp ?? timestampMs,
          level: body.level,
          plugged: body.plugged
        };
        devices = devices.map((d) => (d.id === deviceId ? device : d));
        await redisClient.set(key, JSON.stringify(devices));

        return { success: true };
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

import { Injectable, Logger } from '@nestjs/common';
import getRedisClient from '../utils/redis';
import { TailscaleDevice } from '../types/tailscale.interface';

@Injectable()
export class AdbService {
  private readonly logger = new Logger(AdbService.name);

  async getConnectedAdbDevices(): Promise<string[]> {
    try {
      const redisClient = await getRedisClient();
      const devices = await redisClient.get('connected_adb_devices');
      if (!devices || typeof devices !== 'string') {
        return [];
      }
      const parsed = JSON.parse(devices) as string[];
      return parsed;
    } catch (error) {
      this.logger.error(error);
      return [];
    }
  }

  async setAdbDeviceIdentifier(deviceId: string, identifier: number | null) {
    try {
      const redisClient = await getRedisClient();
      const key = `devices`;

      const devicesRaw = await redisClient.get(key);
      if (!devicesRaw || typeof devicesRaw !== 'string') {
        return { success: false };
      }
      let devices = JSON.parse(devicesRaw) as TailscaleDevice[];
      const device = devices.find((d) => d.id === deviceId);
      if (!device) {
        return { success: false };
      }
      if (!device.androidConfig) device.androidConfig = {};
      if (!device.androidConfig.adb) device.androidConfig.adb = {};
      device.androidConfig.adb.port =
        identifier !== null ? identifier : undefined;
      devices = devices.map((d) => (d.id === deviceId ? device : d));

      await redisClient.set(key, JSON.stringify(devices));
      return { success: true };
    } catch (error) {
      this.logger.error(error);
      return { success: false };
    }
  }
}

import { Injectable, Logger } from '@nestjs/common';
import { DevicesDB } from '../devices/devices.db';
import getRedisClient from '../utils/redis';

@Injectable()
export class AdbService {
  private readonly logger = new Logger(AdbService.name);

  constructor(private readonly devicesDb: DevicesDB) {}

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

  async setAdbDeviceIdentifier(deviceId: string, identifier: string | null) {
    try {
      const device = await this.devicesDb.findOne(deviceId);
      if (!device) {
        return { success: false };
      }
      const portNumber = Number(identifier);
      if (isNaN(portNumber)) {
        return { success: false };
      }

      const updated = await this.devicesDb.updateAdditionals(deviceId, {
        androidConfig: {
          adb: {
            port: identifier !== null ? portNumber : undefined,
          },
        },
      });

      return { success: !!updated };
    } catch (error) {
      this.logger.error(error);
      return { success: false };
    }
  }
}

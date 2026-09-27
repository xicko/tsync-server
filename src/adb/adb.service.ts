/* eslint-disable prettier/prettier */
import {
  BadRequestException,
  Injectable,
  InternalServerErrorException,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { DevicesDB } from '../devices/devices.db';
import getRedisClient from '../utils/redis';

@Injectable()
export class AdbService {
  private readonly logger = new Logger(AdbService.name);

  constructor(private readonly devicesDb: DevicesDB) {}

  async getConnectedAdbDevices(): Promise<string[]> {
    const redisClient = await getRedisClient();
    const devices = await redisClient.get('connected_adb_devices');
    if (!devices || typeof devices !== 'string') {
      return [];
    }
    return JSON.parse(devices) as string[];
  }

  async setAdbDeviceIdentifier(deviceId: string, identifier: string | null) {
    const device = await this.devicesDb.findOne(deviceId);
    if (!device) throw new NotFoundException('Device not found');

    let port: number | null;
    if (identifier === null || identifier === '') {
      port = null;
    } else {
      const portNumber = Number(identifier);
      if (isNaN(portNumber)) throw new BadRequestException('Identifier must be a number');
      port = portNumber;
    }

    const updated = await this.devicesDb.updateConfig(deviceId, {
      androidConfig: {
        adb: {
          port,
        },
      },
    });
    if (!updated) throw new InternalServerErrorException('Failed to update ADB identifier');

    return updated;
  }
}

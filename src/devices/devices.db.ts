/* eslint-disable prettier/prettier */
import { Injectable, Logger } from '@nestjs/common';
import { TailscaleDevice, TailscaleDeviceAdditionals } from 'src/types/tailscale.interface';
import getRedisClient from 'src/utils/redis';

@Injectable()
export class DevicesDB {
  private logger = new Logger(DevicesDB.name);

  private key = 'devices';

  async findAll(): Promise<TailscaleDevice[] | null> {
    try {
      const redisClient = await getRedisClient();
      const devices = await redisClient.get(this.key);
      if (!devices || typeof devices !== 'string') return null;
      const devicesParsed: TailscaleDevice[] = JSON.parse(devices);
      return devicesParsed;
    } catch (error) {
      this.logger.error(error);
      return null;
    }
  }

  async findOne(id: string): Promise<TailscaleDevice | null> {
    const devices = await this.findAll();
    return devices?.find((d) => d.id === id) || null;
  }

  async saveAll(
    data: TailscaleDevice[],
    returnNew?: boolean,
  ): Promise<TailscaleDevice[] | null> {
    try {
      const redisClient = await getRedisClient();
      await redisClient.set(this.key, JSON.stringify(data));
      if (returnNew === true) return this.findAll();
      return null;
    } catch (error) {
      this.logger.error(error);
      return null;
    }
  }

  async saveOne(data: TailscaleDevice): Promise<boolean> {
    try {
      const arr = [data];
      const existingAll = await this.findAll();
      if (!existingAll || (existingAll && existingAll.length === 0)) {
        await this.saveAll(arr);
        return true;
      }
      const excluded = existingAll.filter((f) => f.id !== data.id);
      const mod = [data, ...excluded];
      await this.saveAll(mod);
      return true;
    } catch (error) {
      this.logger.error(error);
      return false;
    }
  }

  async updateAdditionals(
    id: string,
    additionals: Partial<TailscaleDeviceAdditionals>,
  ): Promise<TailscaleDevice | null> {
    try {
      const devices = await this.findAll();
      if (!devices) return null;

      let updatedDevice: TailscaleDevice | null = null;

      const updatedDevices = devices.map((device) => {
        if (device.id !== id) return device;

        const merged: TailscaleDevice = {
          ...device,
          ...additionals,
          androidConfig: additionals.androidConfig !== undefined ? {
            ...device.androidConfig,
            ...additionals.androidConfig,
            adb: additionals.androidConfig.adb !== undefined ? {
              ...device.androidConfig?.adb,
              ...additionals.androidConfig.adb,
            } : device.androidConfig?.adb,
          } : device.androidConfig,
          windowsConfig: additionals.windowsConfig !== undefined ? {
            ...device.windowsConfig,
            ...additionals.windowsConfig,
          } : device.windowsConfig,
        };

        updatedDevice = merged;
        return merged;
      });

      if (!updatedDevice) return null;

      await this.saveAll(updatedDevices);
      return updatedDevice;
    } catch (error) {
      this.logger.error(error);
      return null;
    }
  }
}

/* eslint-disable prettier/prettier */
import { Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { BatteryStatus, TailscaleDevice } from 'src/types/tailscale.interface';
import { DeviceConfig, DeviceConfigUpdate } from 'src/schemas/device-config.schema';
import getRedisClient from 'src/utils/redis';

@Injectable()
export class DevicesDB {
  private logger = new Logger(DevicesDB.name);

  private key = 'devices';
  private batteryKey = 'device_batteries';

  constructor(
    @InjectModel(DeviceConfig.name) private deviceConfigModel: Model<DeviceConfig>,
  ) {}

  async findAllRaw(): Promise<TailscaleDevice[] | null> {
    try {
      const redisClient = await getRedisClient();
      const devices = await redisClient.get(this.key);
      if (!devices || typeof devices !== 'string') return null;

      return JSON.parse(devices) as TailscaleDevice[];
    } catch (error) {
      this.logger.error(error);
      return null;
    }
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

  async findAll(): Promise<TailscaleDevice[] | null> {
    const raw = await this.findAllRaw();
    if (!raw) return null;

    const [configs, batteries] = await Promise.all([
      this.getAllConfigs(),
      this.getAllBatteries(),
    ]);

    const configMap = new Map(configs.map((c) => [c._id, c]));
    return raw.map((d) => this.mergeDevice(d, configMap.get(d.id), batteries[d.id]),
    );
  }

  async findOne(id: string): Promise<TailscaleDevice | null> {
    const devices = await this.findAll();
    return devices?.find((d) => d.id === id) || null;
  }

  private mergeDevice(
    device: TailscaleDevice,
    config?: DeviceConfig,
    battery?: BatteryStatus,
  ): TailscaleDevice {
    const merged: TailscaleDevice = {
      ...device,
      batterySync: config?.batterySync ?? true,
      battery,
    };

    const macAddress = config?.windowsConfig?.macAddress;
    if (macAddress) {
      merged.windowsConfig = { 
        ...device.windowsConfig, macAddress,
      };
    };

    const userAdbPort = config?.androidConfig?.adb?.port;
    if (userAdbPort != null) {
      merged.androidConfig = {
        ...device.androidConfig,
        adb: {
          ...device.androidConfig?.adb,
          port: userAdbPort
        },
      };
    };

    return merged;
  }

  async getAllConfigs(): Promise<DeviceConfig[]> {
    try {
      return await this.deviceConfigModel.find().lean();
    } catch (error) {
      this.logger.error(error);
      return [];
    }
  }

  async getConfig(id: string): Promise<DeviceConfig | null> {
    try {
      return await this.deviceConfigModel.findById(id).lean();
    } catch (error) {
      this.logger.error(error);
      return null;
    }
  }

  async updateConfig(
    id: string,
    update: DeviceConfigUpdate,
  ): Promise<DeviceConfig | null> {
    try {
      const set: Record<string, any> = {};
      const unset: Record<string, any> = {};

      const apply = (key: string, value: unknown) => {
        if (value === undefined) return;
        if (value === null) unset[key] = '';
        else set[key] = value;
      };

      apply('batterySync', update.batterySync);
      apply('androidConfig.adb.port', update.androidConfig?.adb?.port);
      apply('windowsConfig.macAddress', update.windowsConfig?.macAddress);

      const ops: Record<string, any> = {};
      if (Object.keys(set).length > 0) ops.$set = set;
      if (Object.keys(unset).length > 0) ops.$unset = unset;

      return await this.deviceConfigModel
        .findByIdAndUpdate(id, ops, {
          upsert: true,
          new: true,
          setDefaultsOnInsert: true,
        })
        .lean();
    } catch (error) {
      this.logger.error(error);
      return null;
    }
  }

  async getAllBatteries(): Promise<Record<string, BatteryStatus>> {
    try {
      const redisClient = await getRedisClient();
      const raw = await redisClient.hGetAll(this.batteryKey);
      const result: Record<string, BatteryStatus> = {};
      for (const [id, value] of Object.entries(raw)) {
        try {
          result[id] = JSON.parse(value as string) as BatteryStatus;
        } catch {
          continue;
        }
      }
      return result;
    } catch (error) {
      this.logger.error(error);
      return {};
    }
  }

  async setBattery(id: string, battery: BatteryStatus): Promise<void> {
    try {
      const redisClient = await getRedisClient();
      await redisClient.hSet(this.batteryKey, id, JSON.stringify(battery));
    } catch (error) {
      this.logger.error(error);
    }
  }
}

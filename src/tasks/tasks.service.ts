/* eslint-disable @typescript-eslint/no-unused-vars */
/* eslint-disable prettier/prettier */
import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { Cron, CronExpression, SchedulerRegistry } from '@nestjs/schedule';
import { CronJob } from 'cron';
import { EventsGateway } from 'src/events/events.gateway';
import {
  TailscaleDevice,
  TailscaleDevicesResponse,
} from 'src/types/tailscale.interface';
import { OneSignal } from 'src/utils/onesignal';
import getRedisClient from 'src/utils/redis';
import dayjs from 'dayjs';
import duration from 'dayjs/plugin/duration';
import { runCommandSpawn } from 'src/utils/shell';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { CronConfig } from 'src/schemas/cron-config.schema';
import { CronLog } from 'src/schemas/cron-log.schema';
import { DevicesService } from 'src/devices/devices.service';
import { DevicesDB } from 'src/devices/devices.db';
import { SettingsDB } from 'src/global/settings/settings.db';
import { getReadableDeviceName } from 'src/devices/utils/device';

dayjs.extend(duration);

const ACTIVE_THRESHOLD_MS = 60000;

function resolveIsActive(device: TailscaleDevice): boolean {
  if (!device.connectedToControl) return false;
  if (!device.lastSeen) return false;
  return Date.now() - new Date(device.lastSeen).getTime() < ACTIVE_THRESHOLD_MS;
}

@Injectable()
export class TasksService implements OnModuleInit {
  private readonly logger = new Logger(TasksService.name);

  constructor(
    private readonly gateway: EventsGateway,
    private readonly devicesService: DevicesService,
    private readonly schedulerRegistry: SchedulerRegistry,
    @InjectModel(CronConfig.name) private cronConfigModel: Model<CronConfig>,
    @InjectModel(CronLog.name) private cronLogModel: Model<CronLog>,
    private readonly devicesDb: DevicesDB,
    private readonly settingsDb: SettingsDB,
  ) {}

  async onModuleInit() {
    this.logger.log('Initializing dynamic cron jobs...');
    const defaultCrons = [
      { name: 'handleSheetsCron', type: 'SHEETS', expression: CronExpression.EVERY_HOUR, data: {} },
      { name: 'handleServiceHealthCheckCron', type: 'HEALTHCHECK', expression: CronExpression.EVERY_MINUTE, data: {} },
    ];

    for (const jobConfig of defaultCrons) {
      let config = await this.cronConfigModel.findOne({ name: jobConfig.name });
      if (!config) {
        config = await this.cronConfigModel.create({
          name: jobConfig.name,
          type: jobConfig.type,
          cronExpression: jobConfig.expression,
          data: jobConfig.data,
          isActive: true,
        });
      }
    }

    const allConfigs = await this.cronConfigModel.find();
    for (const config of allConfigs) {
      if (config.isActive) {
        try {
          await this.stopCronJob(config.name);
        } catch(e) {
          this.logger.error(`Failed to stop cron job ${config.name}:`, e);
        }
        this.registerJobByType(config.name, config.type, config.cronExpression, config.data);
      }
    }
  }

  async reinitCronJobs() {
    this.logger.log('Re-initializing cron jobs by user request...');
    const allConfigs = await this.cronConfigModel.find();
    for (const config of allConfigs) {
      try {
        await this.stopCronJob(config.name);
      } catch (e) {
        this.logger.error(`Failed to stop cron job ${config.name}:`, e);
      }
    }
    await this.onModuleInit();
  }

  registerJobByType(name: string, type: string, cronExpression: string, data: any) {
    let method: () => Promise<void>;
    
    switch(type) {
      case 'REMINDER': method = () => this.handleReminderCron(data); break;
      case 'COUNT': method = () => this.handleCountCron(data); break;
      case 'HEALTHCHECK': method = () => this.handleServiceHealthCheckCron(data); break;
      default:
        this.logger.warn(`Unknown cron type ${type} for job ${name}`);
        return;
    }

    this.addCronJob(name, cronExpression, method);
  }

  addCronJob(name: string, cronExpression: string, callback: () => Promise<void>) {
    const job = new CronJob(cronExpression, async () => {
      const startTime = Date.now();
      let status: 'SUCCESS' | 'FAILED' = 'SUCCESS';
      let output = '';
      try {
        await callback();
      } catch (err: any) {
        status = 'FAILED';
        output = err.message || JSON.stringify(err);
        this.logger.error(`Job ${name} failed:`, err);
      } finally {
        const durationMs = Date.now() - startTime;
        await this.cronLogModel.create({ name, status, output, durationMs });
        this.logger.debug(`Job ${name} finished in ${durationMs}ms with status ${status}`);
      }
    });

    this.schedulerRegistry.addCronJob(name, job);
    job.start();
    this.logger.log(`Job ${name} added and started with interval ${cronExpression}`);
  }

  async stopCronJob(name: string) {
    try {
      const job = this.schedulerRegistry.getCronJob(name);
      await job.stop();
      this.schedulerRegistry.deleteCronJob(name);
      this.logger.log(`Job ${name} stopped and deleted.`);
    } catch (e) {
      this.logger.warn(`Job ${name} could not be stopped: ${e?.message}`);
    }
  }

  async createCronJob(name: string, type: string, cronExpression: string, data: any, isActive: boolean) {
    const existing = await this.cronConfigModel.findOne({ name });
    if (existing) throw new Error("Cron job with this name already exists");
    
    await this.cronConfigModel.create({ name, type, cronExpression, data, isActive });
    if (isActive) {
      this.registerJobByType(name, type, cronExpression, data);
    }
  }

  async deleteCronJob(name: string) {
    await this.stopCronJob(name);
    await this.cronConfigModel.deleteOne({ name });
    await this.cronLogModel.deleteMany({ name });
  }

  async updateCronJob(name: string, cronExpression: string, isActive: boolean, data?: any) {
    const config = await this.cronConfigModel.findOne({ name });
    if (!config) throw new Error('Not found');

    if (data !== undefined) config.data = data;
    config.cronExpression = cronExpression;
    config.isActive = isActive;
    await config.save();
    
    await this.stopCronJob(name);

    if (config.isActive) {
      this.registerJobByType(name, config.type, config.cronExpression, config.data);
    }
  }
  
  async triggerCronJob(name: string) {
    const config = await this.cronConfigModel.findOne({ name });
    if (!config) throw new Error('Not found');

    let method: () => Promise<void>;
    switch(config.type) {
      case 'REMINDER': method = () => this.handleReminderCron(config.data); break;
      case 'COUNT': method = () => this.handleCountCron(config.data); break;
      case 'HEALTHCHECK': method = () => this.handleServiceHealthCheckCron(config.data); break;
      default: throw new Error("Unknown type");
    }

    const startTime = Date.now();
    let status: 'SUCCESS' | 'FAILED' = 'SUCCESS';
    let output = '';
    try {
      await method();
    } catch (err: any) {
      status = 'FAILED';
      output = err.message || JSON.stringify(err);
      this.logger.error(`Manual Job ${name} failed:`, err);
    } finally {
      const durationMs = Date.now() - startTime;
      await this.cronLogModel.create({ name, status, output, durationMs });
      this.logger.debug(`Manual Job ${name} finished in ${durationMs}ms with status ${status}`);
    }
  }

  // DEVICES
  @Cron(CronExpression.EVERY_30_SECONDS)
  async handleDevicesCron() {
    const existingDevicesMap = new Map<string, TailscaleDevice>();
    const existingDevices = (await this.devicesDb.findAll()) || [];
    existingDevices.forEach((p) => existingDevicesMap.set(p.id, p));

    const latestDevicesMap = new Map<string, TailscaleDevice>();
    const latestDevices = (await this.getDevices(existingDevicesMap)).devices || [];
    latestDevices.forEach((n) => latestDevicesMap.set(n.id, n));

    const updatedDevices: TailscaleDevice[] = [];
    const addedDevices: (TailscaleDevice & { readableName: string })[] = [];
    
    latestDevices.forEach((val) => {
      const existingDevice = existingDevicesMap.get(val.id);

      if (!existingDevice && existingDevices.length > 0) addedDevices.push({...val, readableName: getReadableDeviceName(val.name) });

      if (existingDevice && resolveIsActive(existingDevice) !== resolveIsActive(val)) updatedDevices.push(val);
    });

    if (addedDevices.length > 0) void (() => {
      void OneSignal
        .create()
        .title(`${addedDevices.length} DEVICE(S) ADDED`)
        .message(addedDevices.map((n) => n.readableName).join('\n'))
        .rest({ priority: 10 })
        .sendPush({ isImportant: true })
        .then((n) => n.sendToNtfy());
    })();

    await this.devicesDb.saveAll(latestDevices);
    this.gateway.server.emit('devicesUpdate', JSON.stringify(latestDevices));

    this.logger.debug(`updated: ${JSON.stringify(updatedDevices.length)}`);

    void (async () => {
      try {
        const alertSettings = await this.settingsDb.getAlert();
        const isEnabled = alertSettings?.enabled ?? false;
        const denylistIds = new Set<string>(alertSettings?.denylist || []);
        if (isEnabled) {
          await Promise.all(
            updatedDevices.map(async (u) => {
              if (!denylistIds.has(u.id)) {
                await OneSignal.create()
                  .title('UPDATE')
                  .message(`${resolveIsActive(u) ? 'ACTIVE' : 'OFFLINE'}: ${u.os}: ${getReadableDeviceName(u.name)}`)
                  .rest({ priority: 10 })
                  .sendPush({ isImportant: true })
                  .then((n) => n.sendToNtfy());
              }
            }),
          );
        }
      } catch (error) {
        this.logger.error('Failed to send update notifications:', error);
      }
    })();

    this.logger.debug('Devices updated');
  }
  private async getDevices(prevMap?: Map<string, TailscaleDevice>) {
    const url = process.env.TAILNET_BASE_URL;
    const apiKey = process.env.TAILNET_API_KEY;

    const tailnetId = process.env.TAILNET_ID;
    const path = `/tailnet/${tailnetId}/devices`;

    const response = await fetch(`${url}${path}`, {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
    });

    const resJson = await response.json() as Partial<TailscaleDevicesResponse>;

    const redisClient = await getRedisClient();
    const connectedAdbDevices = await redisClient.get('connected_adb_devices');
    const connectedAdbDevicesParsed: string[] = connectedAdbDevices && typeof connectedAdbDevices === 'string'
      ? JSON.parse(connectedAdbDevices)
      : [];      

    if (resJson.devices) {
      const modifiedDevices: TailscaleDevice[] = resJson.devices.map((device) => {
        const prevDevice = prevMap?.get(device.id);

        const connectedMatch = connectedAdbDevicesParsed.find((address) => device.addresses[0] === address.split(':')[0]);
        const adbPort = prevDevice?.androidConfig?.adb?.port ?? (connectedMatch ? Number(connectedMatch.split(':')[1]) : undefined);
        const windowsMacAddress = prevDevice?.windowsConfig?.macAddress;

        return {
          // Tailscale API data
          ...device,

          // tsync-specific data
          isHost: device.addresses[0] === process.env.HOST_IP,
          battery: prevDevice?.battery,

          androidConfig: device.os === 'android' ? {
            ...prevDevice?.androidConfig,
            adb: {
              ...prevDevice?.androidConfig?.adb,
              port: adbPort,
            },
          } : undefined,

          windowsConfig: device.os === 'windows' ? {
            ...prevDevice?.windowsConfig,
            macAddress: windowsMacAddress,
          } : undefined,
        };
      });
      
      return { devices: modifiedDevices };
    }

    return {
      devices: [],
    };
  }

  // REMINDER
  async handleReminderCron(data?: { message?: string }) {
    const message = data?.message || 'Take a break';
    await OneSignal
      .create()
      .title('REMINDER')
      .message(message)
      .rest({
        priority: 10,
      })
      .sendPush({ isImportant: true })
      .then((n) => {
        return n.sendToNtfy();
      });
  }

  // COUNT
  async handleCountCron(data?: { startDate?: string, message?: string }) {
    const startDate = data?.startDate || 'NULL';
    const message = data?.message || 'NULL';
    
    const date = dayjs(startDate, 'YYYY/MM/DD');
    const now = dayjs();

    const diff = now?.diff(date, 'day');

    await OneSignal
      .create()
      .title('COUNT')
      .message(`${diff} ${message}`)
      .rest({
        priority: 10,
      })
      .sendPush({ isImportant: true })
      .then((n) => {
        return n.sendToNtfy();
      });
  }

  // ADB AUTOCONNECT
  @Cron(CronExpression.EVERY_10_MINUTES)
  async handleAdbAutoConnectCron() {
    const devicesRes = await this.devicesService.getDevices();
    const addresses = devicesRes.devices.map((d) => {
      const addr = d.addresses[0];
      const port = d.androidConfig?.adb?.port;
      if (!addr || !port) return null;
      return `${addr}:${port}`;
    }).filter((a) => a !== null);

    this.logger.debug(`Found ${addresses.length} devices to connect`);

    for (const address of addresses) {
      void runCommandSpawn('sh', [
        './src/scripts/shell/adb_connect_once.sh',
        address,
      ]);
    }
  }

  // ADB DEVICES
  private parseAdbOutput(output: string): string[] {
    return output
      .split('\n')
      .map(line => line.trim())
      .filter(line => line && !line.startsWith('List of devices') && line.includes('\tdevice'))
      .map(line => line.split('\t')[0]);
  }
  @Cron(CronExpression.EVERY_30_SECONDS)
  async handleAdbDevicesListenerCron() {
    const res = await runCommandSpawn('adb', ['devices']);
    const connectedDevices = this.parseAdbOutput(res);
    this.logger.log(connectedDevices);

    const redisClient = await getRedisClient();
    await redisClient.set('connected_adb_devices', JSON.stringify(connectedDevices));
  }

  // Service healthcheck
  async handleServiceHealthCheckCron(data?: { url?: string }) {
    if (data?.url) {
      // Manual override if user set a direct URL in config payload
      const res = await fetch(data.url, { method: 'GET', signal: AbortSignal.timeout(5000) });
      if (!res.ok) throw new Error(`Healthcheck failed with status: ${res.status}`);
      this.logger.debug(`Manual Healthcheck OK against ${data.url}`);
      return;
    }

    const parsed = await this.devicesDb.findAll();
    if (!parsed || parsed.length === 0) throw new Error('No devices found in Redis');

    const addresses = parsed.map((device) => device.addresses[0]);
    if (addresses.length === 0) throw new Error('No Tailscale addresses found');

    const port = process.env.WOL_SERVICE_PORT || '2500';

    const results = await Promise.allSettled(addresses.map(async (address) => {
      const url = `http://${address}:${port}/`;
      try {
        const res = await fetch(url, {
          method: 'GET',
          signal: AbortSignal.timeout(5000),
        });
        if (!res.ok) throw new Error(`Status ${res.status}`);
        return { url, success: true };
      } catch (e) {
        return { url, success: false };
      }
    }));

    const activeNodes = results
      .filter(r => r.status === 'fulfilled' && r.value.success)
      .map(r => (r as PromiseFulfilledResult<{ url: string }>).value.url);
    
    if (activeNodes.length === 0) {
      throw new Error(`All ${addresses.length} WOL nodes failed healthcheck on port ${port}.`);
    }

    this.logger.debug(`Healthcheck OK. Active WOL nodes: ${activeNodes.length}/${addresses.length} (${activeNodes.join(', ')})`);
  }
}

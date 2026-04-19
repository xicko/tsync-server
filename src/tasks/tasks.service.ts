/* eslint-disable @typescript-eslint/no-unused-vars */
/* eslint-disable prettier/prettier */
import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { Cron, CronExpression, SchedulerRegistry } from '@nestjs/schedule';
import { CronJob } from 'cron';
import { SheetsService } from 'src/sheets/sheets.service';
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
import { TelegramService } from 'src/telegram/telegram.service';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { SheetRow } from 'src/schemas/sheet-row.schema';
import { CronConfig } from 'src/schemas/cron-config.schema';
import { CronLog } from 'src/schemas/cron-log.schema';

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
    private readonly sheetsService: SheetsService,
    private readonly telegramService: TelegramService,
    @InjectModel(SheetRow.name) private sheetRowModel: Model<SheetRow>,
    private readonly schedulerRegistry: SchedulerRegistry,
    @InjectModel(CronConfig.name) private cronConfigModel: Model<CronConfig>,
    @InjectModel(CronLog.name) private cronLogModel: Model<CronLog>
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
      case 'SHEETS': method = () => this.handleSheetsCron(); break;
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
      case 'SHEETS': method = () => this.handleSheetsCron(); break;
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
    const key = 'devices';
    const redisClient = await getRedisClient();

    const prevDevicesRaw = await redisClient.get(key);
    const prevDevices: TailscaleDevice[] =
      prevDevicesRaw && typeof prevDevicesRaw === 'string'
        ? JSON.parse(prevDevicesRaw)
        : [];

    const prevMap = new Map<string, TailscaleDevice>();
    prevDevices.forEach((p) => {
      prevMap.set(p.id, p);
    });

    const rawRes = await this.getDevices(prevMap);
    const res = rawRes.devices || [];

    const newMap = new Map<string, TailscaleDevice>();
    res.forEach((n) => {
      newMap.set(n.id, n);
    });

    const updated: TailscaleDevice[] = [];
    res.forEach((val) => {
      const prev = prevMap.get(val.id);
      if (prev && resolveIsActive(prev) !== resolveIsActive(val)) {
        updated.push(val);
      }
    });

    await redisClient.set(key, JSON.stringify(res));
    this.gateway.server.emit('devicesUpdate', JSON.stringify(res));

    this.logger.debug(`updated: ${JSON.stringify(updated.length)}`);

    await Promise.all(
      updated.map(
        async (u) =>
          await OneSignal
            .create()
            .title('UPDATE')
            .message(`${resolveIsActive(u) ? 'ACTIVE' : 'OFFLINE'}: ${u.os}: ${u.name.split('.')[0]}`)
            .rest({
              priority: 10,
            })
            .sendPush({ isImportant: true })
            .then((n) => {
              return n.sendToNtfy();
            }),
          ),
      );

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
      const modifiedDevices = resJson.devices.map((device) => {
        const prevDevice = prevMap?.get(device.id);

        const adbIdentifier = prevDevice?.adbIdentifier ?? connectedAdbDevicesParsed.find((address) => device.addresses[0] === address.split(':')[0]);
        const windowsMacAddress = prevDevice?.windowsMacAddress;

        return {
          ...device,

          isHost: device.addresses[0] === process.env.HOST_IP,

          adbIdentifier: device.os === 'android' ? adbIdentifier : undefined,
          windowsMacAddress: device.os === 'windows' ? windowsMacAddress : undefined,
        };
      });
      
      return { devices: modifiedDevices } as TailscaleDevicesResponse;
    }

    return {
      devices: [],
    };
  }

  // SHEETS
  async handleSheetsCron() {
    await this.sheetsService.syncSheet();
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
  @Cron(CronExpression.EVERY_HOUR)
  async handleAdbAutoConnectCron() {
    const res1 = await runCommandSpawn('adb', [
      'connect',
      process.env.ADB_ADDRESS || '',
    ]);
    const res2 = await runCommandSpawn('sh', [
      './src/scripts/shell/adb_connect.sh',
      process.env.ADB_ADDRESS2 || '',
    ]);
    
    this.logger.log(res1);
    this.logger.log(res2);
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

    const redisClient = await getRedisClient();
    const devicesRaw = await redisClient.get('devices');
    if (!devicesRaw || typeof devicesRaw !== 'string') throw new Error('No devices found in Redis');

    const parsed = JSON.parse(devicesRaw) as TailscaleDevice[];
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

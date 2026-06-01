/* eslint-disable prettier/prettier */
import { Injectable, Logger } from '@nestjs/common';
import getRedisClient from '../utils/redis';
import { TailscaleDevice } from '../types/tailscale.interface';
import { CollectedNotification } from './types/notifications-sync.interface';
import { Request } from 'express';
import { getClientIp } from 'src/utils/network';
import { OneSignal } from 'src/utils/onesignal';
import dayjs from 'dayjs';
import { createHash } from 'crypto';
import { InjectModel } from '@nestjs/mongoose';
import { NotificationsSyncLog } from 'src/schemas/notifications-sync-log.schema';
import { Model } from 'mongoose';
import { ReqQuery } from 'src/types/request.interface';

@Injectable()
export class NotificationsSyncService {
  private readonly logger = new Logger(NotificationsSyncService.name);

  constructor (
    @InjectModel(NotificationsSyncLog.name) private notificationsSyncLogModel: Model<NotificationsSyncLog>,
  ) {}

  async receiveNotification(
    req: Request,
    deviceId: string,
    body: CollectedNotification,
  ): Promise<{ success: boolean }> {
    try {
      const redisClient = await getRedisClient();
      const key = `devices`;
      const devicesRaw = await redisClient.get(key);
      if (!devicesRaw || typeof devicesRaw !== 'string') {
        return { success: false };
      }
      const devices = JSON.parse(devicesRaw) as TailscaleDevice[];
      const device = devices.find((d) => d.id === deviceId);
      if (!device) {
        return { success: false };
      }
      
      const reqIp = getClientIp(req);
      if (device?.addresses[0] !== reqIp) {
        return { success: false };
      }
      
      if (body.type === 'android' && device.os === 'android') {
        const notification = body.android;
        const deviceName = device.name.split('.')[0] || '';
        this.logger.debug(notification);

        const pn = notification.packageName.toLowerCase().trim();
        const t = notification.title.toLowerCase().trim();
        const m = notification.text.toLowerCase().trim();
        const it = notification.infoText.toLowerCase().trim();
        const ct = notification.conversationTitle.toLowerCase().trim();
        const hashKey = `${pn}|${t}|${m}|${it}|${ct}`;
        const hash = createHash('sha256').update(hashKey).digest('hex');

        const redisKey = `notification:${hash}`;

        const lastNotification = await redisClient.get(redisKey);
        if (lastNotification !== null) {
          this.logger.debug('Duplicate notification blocked');
          return { success: false };
        }

        await redisClient.set(redisKey, '1', { expiration: { value: 15000, type: 'PX' } });

        const message = `${notification.title}\n${notification.text}\n${notification.packageName}\n${dayjs(notification.timestamp).format('MM/DD - HH:mm:ss')}`;

        const sendIds = devices.filter((d) => d.id !== deviceId).map((d) => d.id);

        this.logger.debug(sendIds);

        const log = new this.notificationsSyncLogModel({
          type: 'android',
          tailscaleId: device.id,
          timestamp: notification.timestamp,
          android: {
            packageName: notification.packageName,
            timestamp: notification.timestamp,
            title: notification.title,
            text: notification.text,
            bigText: notification.bigText,
            infoText: notification.infoText,
            titleBig: notification.titleBig,
            conversationTitle: notification.conversationTitle,
            peopleList: notification.peopleList,
          },
        });

        await OneSignal
          .create()
          .title(`${deviceName} (Notifications Sync)`)
          .message(message)
          .userIds(sendIds)
          .sendPush({
            isImportant: true,
          }).then((n) => {
            n.sendToNtfy();
          });
        
        try {
          await log.save();
        } catch (error) {
          this.logger.error(error);
        };
      } else {
        // TODO
      }

      return { success: true };
    } catch (error) {
      this.logger.error(error);
      return { success: false };
    }
  }

  async getNotificationsList(
    req: Request,
    query: ReqQuery,
  ) {
    const ip = getClientIp(req);
    const redisClient = await getRedisClient();
    const devices: TailscaleDevice[] = await (async () => {
      const dData = await redisClient.get('devices');
      if (!dData || typeof dData !== 'string') return [];
      return JSON.parse(dData) as TailscaleDevice[];
    })();
    const acceptedIps = devices.map((d) => d.addresses[0]);
    if (!acceptedIps.includes(ip)) return {
      success: false,
    };

    let paginationMode: 'paged' | 'timestamp' = 'paged';

    if (query.timestamp) paginationMode = 'timestamp';

    const page = Number(query?.page || 1);
    const limit = Number(query?.limit || 10);

    const skip = (page * limit) - limit;

    try {
      const [res, total] = await Promise.all([
        this.notificationsSyncLogModel
          .find(paginationMode === 'paged'
            ? {}
            : { 'timestamp': { $lt: Number(query.timestamp) } })
          .sort({ 'timestamp': -1 })
          .limit(paginationMode === 'paged' ? limit : (limit + 1))
          .skip(paginationMode === 'paged' ? skip : 0),
        this.notificationsSyncLogModel.countDocuments(),
      ]);

      const paginationResponse = paginationMode === 'paged' ? {
        hasNext: (total / limit) > page,
        hasPrev: page > 1,
        page,
      } : {
        hasNext: res.length > limit,
        timestamp: query.timestamp,
        lastItemTimestamp: (() => {
          const lastItem = res[limit];
          if (!lastItem?.timestamp) return undefined;
          return lastItem.timestamp;
        })(),
      }

      return {
        success: true,
        data: res.slice(0, limit).map((r) => {
          const tailscaleDevice = devices.find((d) => d.id === r.toObject().tailscaleId);
          return {
            ...r.toObject(),
            tailscaleDevice,
          };
        }),
        pagination: {
          total,
          limit,
          ...paginationResponse,
        },
      }
    } catch (error) {
      this.logger.error(error);
      return {
        success: false,
      }
    }
  }
}

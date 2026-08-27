/* eslint-disable prettier/prettier */
import { Logger } from '@nestjs/common';
import axios from 'axios';
import {
  OneSignalCustomDataType,
  OneSignalPayloadType,
  OneSignalSegmentType,
} from 'src/types/onesignal.interface';

interface ServicePayload {
  userIds?: string[];
  included_segments?: OneSignalSegmentType[];
  title: string;
  message: string;
  data?: OneSignalCustomDataType;
  rest?: Record<string, any>;
}

interface NeedsTitle {
  title(title: string): NeedsMessage;
}

interface NeedsMessage {
  message(message: string): CanSend;
}

interface SendPushOptions {
  isImportant?: boolean;
}

interface CanSend {
  userIds(userIds: string[]): CanSend;
  segment(segment: OneSignalSegmentType): CanSend;
  data(data: OneSignalCustomDataType): CanSend;
  rest(rest: Record<string, any>): CanSend;
  sendPush(options?: SendPushOptions): Promise<CanSend>;
  sendToNtfy(): CanSend;
}

export class OneSignal implements NeedsTitle, NeedsMessage, CanSend {
  private logger = new Logger(OneSignal.name);

  private key = process.env.ONESIGNAL_REST_KEY || '';
  private app_id = process.env.ONESIGNAL_APP_ID!;

  private payload: Partial<ServicePayload> = {};

  public static create(): NeedsTitle {
    return new OneSignal();
  }

  public title(title: string): NeedsMessage {
    this.payload.title = title;
    return this;
  }

  public message(message: string): CanSend {
    this.payload.message = message;
    return this;
  }

  public userIds(userIds: string[]): CanSend {
    this.payload.userIds = userIds;
    return this;
  }

  public segment(segment: OneSignalSegmentType): CanSend {
    this.payload.included_segments = [segment];
    return this;
  }

  public data(data: OneSignalCustomDataType): CanSend {
    this.payload.data = data;
    return this;
  }

  public rest(rest: Record<string, any>): CanSend {
    this.payload.rest = rest;
    return this;
  }

  public async sendPush(options?: SendPushOptions): Promise<CanSend> {
    const sendTo = (this.payload.userIds?.length || 0) > 0 ? {
      include_external_user_ids: this.payload.userIds,
      included_segments: undefined,
    }
      :
    {
      included_segments: this.payload.included_segments || ['Active Subscriptions'],
      include_external_user_ids: undefined,
    }

    const payload: OneSignalPayloadType = {
      app_id: this.app_id,
      ...sendTo,
      target_channel: 'push',
      headings: { en: this.payload.title },
      contents: { en: this.payload.message },
      data: this.payload.data,
      android_channel_id:
        options?.isImportant === true
          ? process.env.ONESIGNAL_ANDROID_IMPORTANT_CHANNEL_ID
          : undefined,
      ...this.payload.rest,
    };

    try {
      const res = await axios.post(
        'https://api.onesignal.com/notifications',
        payload,
        {
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Basic ${this.key}`,
            accept: 'application/json',
          },
        },
      );

      this.logger.debug('Notification sent:', res.data);
    } catch (error) {
      this.logger.error('sendPushNotification error:', error);
    }

    return this;
  }

  public sendToNtfy(): CanSend {
    const url = process.env.NTFY_URL!;
    const topic = process.env.NTFY_TOPIC!;

    if (!url || !topic) {
      this.logger.warn('NTFY_URL OR NTFY_TOPIC not defined');
      return this;
    };

    const title = this.payload.title;
    const message = this.payload.message;

    // eslint-disable-next-line @typescript-eslint/no-floating-promises
    axios.post(`${url}/${topic}`, message, {
      headers: title
        ? {
            Title: title,
            Priority: 'urgent',
            Tags: 'loudspeaker',
          }
        : undefined,
    }).catch((e) => this.logger.error('sendToNtfy error:', e));

    return this;
  }
}

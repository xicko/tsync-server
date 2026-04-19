import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { TelegramClient } from 'telegram';
import { StringSession } from 'telegram/sessions';

@Injectable()
export class TelegramService implements OnModuleInit {
  private readonly logger = new Logger(TelegramService.name);
  private client: TelegramClient;

  async onModuleInit() {
    const apiId = parseInt(process.env.TELEGRAM_API_ID || '0');
    const apiHash = process.env.TELEGRAM_API_HASH || '';
    const session = new StringSession(process.env.TELEGRAM_SESSION || '');

    if (!apiId || !apiHash) {
      this.logger.warn(
        'Telegram API credentials missing. Telegram service will not be available.',
      );
      return;
    }

    this.client = new TelegramClient(session, apiId, apiHash, {
      connectionRetries: 5,
    });

    try {
      await this.client.connect();
      this.logger.log('Connected to Telegram');
    } catch (err) {
      this.logger.error('Failed to connect to Telegram', err);
    }
  }

  public async sendMessage(userId: string | number, message: string) {
    if (!this.client) {
      throw new Error('Telegram client not initialized');
    }

    try {
      await this.client.sendMessage(userId, { message });
      this.logger.log(`Message sent to ${userId}`);
    } catch (err) {
      this.logger.error(`Failed to send message to ${userId}`, err);
      throw err;
    }
  }

  async disconnect() {
    if (this.client) {
      await this.client.disconnect();
    }
  }
}

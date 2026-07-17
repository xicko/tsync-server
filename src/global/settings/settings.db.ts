/* eslint-disable prettier/prettier */
import { Injectable, Logger } from '@nestjs/common';
import { GlobalSettings } from './settings.interface';
import { GlobalAlertSettings } from './alert/alert.interface';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Settings } from './settings.schema';
import { DEFAULT_GLOBAL_NOTIFICATION_SETTINGS } from './alert/alert.constants';

@Injectable()
export class SettingsDB {
  private logger = new Logger(SettingsDB.name);

  private key = 'global_settings';

  constructor(
    @InjectModel(Settings.name) private settingsModel: Model<Settings>,
  ) {}

  async get(): Promise<GlobalSettings | null> {
    try {
      return await this.settingsModel.findById(this.key).lean();
    } catch (error) {
      this.logger.debug(this.key, ' error:', error?.message);
      return null;
    }
  }

  async getAlert(): Promise<GlobalAlertSettings | null> {
    try {
      const parsed = await this.get();

      return parsed?.alert || null;
    } catch (error) {
      this.logger.debug(this.key, ' alert error:', error?.message);
      return null;
    }
  }

  async saveAlert(alert: Partial<GlobalAlertSettings>): Promise<boolean> {
    try {
      const updateFields: Record<string, any> = {};
      const insertFields: Record<string, any> = {};

      if (alert.enabled !== undefined) {
        updateFields['alert.enabled'] = alert.enabled;
      } else {
        insertFields['alert.enabled'] = DEFAULT_GLOBAL_NOTIFICATION_SETTINGS.enabled;
      }

      if (alert.denylist !== undefined) {
        updateFields['alert.denylist'] = alert.denylist;
      } else {
        insertFields['alert.denylist'] = DEFAULT_GLOBAL_NOTIFICATION_SETTINGS.denylist;
      }

      await this.settingsModel.findByIdAndUpdate(
        this.key,
        {
          $set: updateFields,
          $setOnInsert: insertFields,
        },
        { upsert: true, new: true }
      );

      return true;
    } catch (error) {
      this.logger.debug(this.key, ' alert error:', error?.message);
      return false;
    }
  }
}

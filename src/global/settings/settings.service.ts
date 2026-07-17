import { Injectable } from '@nestjs/common';
import { SettingsDB } from './settings.db';
import { GlobalAlertSettings } from './alert/alert.interface';

@Injectable()
export class SettingsService {
  constructor(private readonly settingsDb: SettingsDB) {}

  async getAlert(): Promise<GlobalAlertSettings | null> {
    return await this.settingsDb.getAlert();
  }

  async saveAlert(alert: Partial<GlobalAlertSettings>): Promise<boolean> {
    return await this.settingsDb.saveAlert(alert);
  }
}

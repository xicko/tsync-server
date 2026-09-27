import { Injectable, InternalServerErrorException } from '@nestjs/common';
import { SettingsDB } from './settings.db';
import { GlobalAlertSettings } from './alert/alert.interface';
import { DEFAULT_GLOBAL_NOTIFICATION_SETTINGS } from './alert/alert.constants';
import { GlobalWolSettings } from './wol/wol.interface';

@Injectable()
export class SettingsService {
  constructor(private readonly settingsDb: SettingsDB) {}

  async getAlert(): Promise<GlobalAlertSettings> {
    return (
      (await this.settingsDb.getAlert()) ?? DEFAULT_GLOBAL_NOTIFICATION_SETTINGS
    );
  }

  async saveAlert(
    alert: Partial<GlobalAlertSettings>,
  ): Promise<GlobalAlertSettings> {
    const saved = await this.settingsDb.saveAlert(alert);
    if (!saved)
      throw new InternalServerErrorException('Failed to save alert settings');
    return saved;
  }

  async getWol(): Promise<GlobalWolSettings> {
    return await this.settingsDb.getWol();
  }

  async saveWol(wol: Partial<GlobalWolSettings>): Promise<GlobalWolSettings> {
    const saved = await this.settingsDb.saveWol(wol);
    if (!saved)
      throw new InternalServerErrorException('Failed to save WOL settings');
    return saved;
  }
}

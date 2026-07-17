import { Body, Controller, Get, Patch } from '@nestjs/common';
import { SettingsService } from './settings.service';
import { GlobalAlertSettings } from './alert/alert.interface';

@Controller('settings')
export class SettingsController {
  constructor(private readonly settingsService: SettingsService) {}

  @Get('/alert')
  async getAlert() {
    const alert = await this.settingsService.getAlert();
    return { success: alert !== null, data: alert };
  }

  @Patch('/alert')
  async saveAlert(@Body() alert: Partial<GlobalAlertSettings>) {
    const success = await this.settingsService.saveAlert(alert);
    return { success };
  }
}

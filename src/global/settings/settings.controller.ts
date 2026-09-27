import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Patch,
} from '@nestjs/common';
import { SettingsService } from './settings.service';
import { GlobalAlertSettings } from './alert/alert.interface';
import { GlobalWolSettings } from './wol/wol.interface';

@Controller('settings')
export class SettingsController {
  constructor(private readonly settingsService: SettingsService) {}

  @Get('/alert')
  async getAlert() {
    return await this.settingsService.getAlert();
  }

  @Patch('/alert')
  async saveAlert(@Body() alert: Partial<GlobalAlertSettings>) {
    return await this.settingsService.saveAlert(alert);
  }

  @Get('/wol')
  async getWol() {
    return await this.settingsService.getWol();
  }

  @Patch('/wol')
  async saveWol(@Body() wol: Partial<GlobalWolSettings>) {
    if (wol.enabled !== undefined && typeof wol.enabled !== 'boolean') {
      throw new BadRequestException('enabled must be a boolean');
    }
    if (
      wol.port !== undefined &&
      (!Number.isInteger(wol.port) || wol.port < 1 || wol.port > 65535)
    ) {
      throw new BadRequestException(
        'port must be an integer between 1 and 65535',
      );
    }
    return await this.settingsService.saveWol(wol);
  }
}

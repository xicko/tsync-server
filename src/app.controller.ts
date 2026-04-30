/* eslint-disable prettier/prettier */
import { Controller, Get, Req } from '@nestjs/common';
import { AppService } from './app.service';
import type { Request } from 'express';
import { DevicesService } from './devices/devices.service';
import { runCommandSpawn } from './utils/shell';

@Controller('sys')
export class AppController {
  constructor(
    private readonly appService: AppService,
    private readonly devicesService: DevicesService,
  ) {}

  onModuleInit() {
    // auto connect to all adb devices on startup
    void (async () => {
      const devicesRes = await this.devicesService.getDevices();
      const addresses = devicesRes.devices.map((d) => {
        const addr = d.addresses[0];
        const port = d.androidConfig?.adb?.port;
        if (!addr || !port) return null;
        return `${addr}:${port}`;
      }).filter((a) => a !== null);

      for (const address of addresses) {
        void runCommandSpawn('sh', [
          './src/scripts/shell/adb_connect_repeating.sh',
          address,
        ]);
      }
    })();
  }

  @Get('/ping')
  ping(@Req() req: Request): string { 
    return this.appService.ping(req); 
  }

  @Get('/ip')
  getIp(@Req() req: Request): string {
    return this.appService.getIp(req);
  }
}

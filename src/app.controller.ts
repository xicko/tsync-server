/* eslint-disable prettier/prettier */
import { Controller, Get, Req } from '@nestjs/common';
import { AppService } from './app.service';
import type { Request } from 'express';

@Controller('sys')
export class AppController {
  constructor(private readonly appService: AppService) {}

  @Get('/ping')
  ping(@Req() req: Request): string { 
    return this.appService.ping(req); 
  }

  @Get('/ip')
  getIp(@Req() req: Request): string {
    return this.appService.getIp(req);
  }
}

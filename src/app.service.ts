/* eslint-disable prettier/prettier */
import { Injectable, Logger } from '@nestjs/common';
import { getClientIp } from './utils/network';
import type { Request } from 'express';

@Injectable()
export class AppService {
  private readonly logger = new Logger(AppService.name);

  ping(req: Request) {
    const ip = getClientIp(req);
    this.logger.debug(`ping from ${ip}`);
    return 'true';
  }

  getIp(req: Request) {
    const ip = getClientIp(req);
    this.logger.debug(`getIp from ${ip}`);
    return ip;
  }
}

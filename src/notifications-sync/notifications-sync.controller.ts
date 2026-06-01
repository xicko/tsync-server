import { Body, Controller, Get, Param, Post, Query, Req } from '@nestjs/common';
import { NotificationsSyncService } from './notifications-sync.service';
import type { CollectedNotification } from './types/notifications-sync.interface';
import type { Request } from 'express';
import type { ReqQuery } from 'src/types/request.interface';

@Controller('notifications-sync')
export class NotificationsSyncController {
  constructor(
    private readonly notificationsSyncService: NotificationsSyncService,
  ) {}

  @Post('/devices/:tailscaleId/receive-notification')
  async receiveNotification(
    @Req() req: Request,
    @Param('tailscaleId') tailscaleId: string,
    @Body() body: CollectedNotification,
  ) {
    return await this.notificationsSyncService.receiveNotification(
      req,
      tailscaleId,
      body,
    );
  }

  @Get('/list')
  async getNotificationsList(@Req() req: Request, @Query() query: ReqQuery) {
    return await this.notificationsSyncService.getNotificationsList(req, query);
  }
}

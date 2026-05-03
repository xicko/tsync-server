import { Body, Controller, Param, Post, Req } from '@nestjs/common';
import { NotificationsSyncService } from './notifications-sync.service';
import type { CollectedNotification } from './types/notifications-sync.interface';
import type { Request } from 'express';

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
}

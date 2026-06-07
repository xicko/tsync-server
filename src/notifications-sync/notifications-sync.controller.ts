/* eslint-disable prettier/prettier */
import { Body, Controller, Delete, Get, Param, Post, Query, Req, UseGuards } from '@nestjs/common';
import { NotificationsSyncService } from './notifications-sync.service';
import type { CollectedNotification } from './types/notifications-sync.interface';
import type { Request } from 'express';
import type { ReqQuery } from 'src/types/request.interface';
import { CreateDenyDto } from './dto/deny.dto';
import { TailscaleIpGuard, TailscaleDeviceIpGuard } from 'src/guards/tailscale-ip.guard';

@Controller('notifications-sync')
export class NotificationsSyncController {
  constructor(
    private readonly notificationsSyncService: NotificationsSyncService,
  ) {}

  @Post('/devices/:tailscaleId/receive-notification')
  @UseGuards(TailscaleDeviceIpGuard)
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
  @UseGuards(TailscaleIpGuard)
  async getNotificationsList(@Req() req: Request, @Query() query: ReqQuery) {
    return await this.notificationsSyncService.getNotificationsList(req, query);
  }

  @Get('/denylist/list')
  @UseGuards(TailscaleIpGuard)
  async getDenyList(@Req() req: Request, @Query() query: ReqQuery) {
    return await this.notificationsSyncService.getDenyList(req, query);
  }

  @Post('/denylist/action/create')
  @UseGuards(TailscaleIpGuard)
  async createDeny(@Req() req: Request, @Body() body: CreateDenyDto) {
    return await this.notificationsSyncService.createDeny(req, body);
  }

  @Delete('/denylist/action/delete/:id')
  @UseGuards(TailscaleIpGuard)
  async deleteDeny(@Req() req: Request, @Param('id') id: string) {
    return await this.notificationsSyncService.deleteDeny(req, id);
  }
}

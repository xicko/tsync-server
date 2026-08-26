import { Controller, Delete, ForbiddenException, Get, HttpCode, HttpStatus, Param, Post, Query, Req, Res, StreamableFile, UploadedFile, UseGuards, UseInterceptors } from '@nestjs/common';
import { StorageService } from './storage.service';
import type { Request, Response } from 'express';
import { FileInterceptor } from '@nestjs/platform-express';
import { TailscaleIpGuard } from 'src/guards/tailscale-ip.guard';
import 'multer';
import type { ReqQuery } from 'src/types/request.interface';
import { getClientIp } from 'src/utils/network';
import { DevicesDB } from 'src/devices/devices.db';

@Controller('storage')
export class StorageController {
  constructor(
    private readonly storageService: StorageService,
    private readonly devicesDb: DevicesDB,
  ) {}

  @Post()
  @UseInterceptors(FileInterceptor('file'))
  @UseGuards(TailscaleIpGuard)
  async uploadFile(@Req() req: Request, @UploadedFile() file: Express.Multer.File) {
    const clientIp = getClientIp(req);
    const devices = (await this.devicesDb.findAll()) || [];
    const tailscaleDevice = devices.find((d) => d.addresses.includes(clientIp));

    if (!tailscaleDevice) throw new ForbiddenException('Device not found in Tailnet');

    return await this.storageService.uploadFile(tailscaleDevice, file);
  }

  @Get()
  @UseGuards(TailscaleIpGuard)
  async getFilesList(@Req() req: Request, @Query() query: ReqQuery) {
    return await this.storageService.getFilesList(query);
  }

  @Get('/:id')
  @UseGuards(TailscaleIpGuard)
  async downloadFile(
    @Param('id') id: string,
    @Res({ passthrough: true }) res: Response,
  ): Promise<StreamableFile> {
    const { buffer, fileName, mimeType } = await this.storageService.downloadFile(id);

    res.set({
      'Content-Type': mimeType,
      'Content-Disposition': `attachment; filename="${encodeURIComponent(fileName)}"`,
    });

    return new StreamableFile(buffer);
  }

  @Delete('/:id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @UseGuards(TailscaleIpGuard)
  async deleteFile(@Param('id') id: string) {
    return await this.storageService.deleteFile(id);
  }
}

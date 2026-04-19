import { Body, Controller, Post } from '@nestjs/common';
import { TelegramService } from './telegram.service';

@Controller('telegram')
export class TelegramController {
  constructor(private readonly telegramService: TelegramService) {}

  @Post('/message')
  async sendMessageTelegram(@Body() body: { to: string; msg: string }) {
    if (!body?.to || !body?.msg) return 'Missing "to" or "msg" body params';
    await this.telegramService.sendMessage(body.to, body.msg);
    return `Message sent to ${body.to}`;
  }
}

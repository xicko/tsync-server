import { Controller, Post } from '@nestjs/common';
import { SheetsService } from './sheets.service';

@Controller('sheets')
export class SheetsController {
  constructor(private readonly sheetsService: SheetsService) {}

  @Post('/sync')
  async syncSheet() {
    return await this.sheetsService.syncSheet();
  }
}

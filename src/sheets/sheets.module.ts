import { Module, Global } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { SheetsService } from './sheets.service';
import { SheetsController } from './sheets.controller';
import { SheetRow, SheetRowSchema } from '../schemas/sheet-row.schema';

@Global()
@Module({
  imports: [
    MongooseModule.forFeature([
      { name: SheetRow.name, schema: SheetRowSchema },
    ]),
  ],
  controllers: [SheetsController],
  providers: [SheetsService],
  exports: [SheetsService, MongooseModule],
})
export class SheetsModule {}

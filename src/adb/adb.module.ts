import { Module, Global } from '@nestjs/common';
import { AdbService } from './adb.service';
import { AdbController } from './adb.controller';

@Global()
@Module({
  controllers: [AdbController],
  providers: [AdbService],
  exports: [AdbService],
})
export class AdbModule {}

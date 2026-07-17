import { Module, Global } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { SettingsDB } from './settings.db';
import { Settings, SettingsSchema } from './settings.schema';

@Global()
@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Settings.name, schema: SettingsSchema },
    ]),
  ],
  providers: [SettingsDB],
  exports: [SettingsDB],
})
export class SettingsModule {}

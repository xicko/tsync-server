import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import * as dotenv from 'dotenv';
import { IoAdapter } from '@nestjs/platform-socket.io';
import { Logger } from '@nestjs/common';
dotenv.config();

async function bootstrap() {
  const logger = new Logger('Bootstrap');
  const app = await NestFactory.create(AppModule);
  app.setGlobalPrefix('api');
  app.useWebSocketAdapter(new IoAdapter(app));
  app.enableCors({
    origin: '*',
  });

  const HOST = process.env.HOST_IP;
  if (!HOST) {
    logger.error('HOST is not defined');
    process.exit(1);
  }

  await app.listen(process.env.PORT ?? 2400, HOST);
  logger.debug(`Application is running on: ${await app.getUrl()}`);
}
bootstrap();

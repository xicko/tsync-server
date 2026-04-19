import { Logger } from '@nestjs/common';
import { createClient, RedisClientType } from 'redis';

const logger = new Logger('RedisClient');

const redisClient = createClient({
  url: process.env.REDIS_URL,
});

redisClient.on('connection', (a) => logger.log('REDIS CONNECT: ', a));
redisClient.on('error', (err) => logger.error('REDIS ERROR:', err));

async function getRedisClient(): Promise<
  RedisClientType<any, any, any, any, any>
> {
  if (!redisClient.isOpen) {
    await redisClient.connect();
  }
  return redisClient;
}

export default getRedisClient;

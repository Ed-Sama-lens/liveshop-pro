import Redis from 'ioredis';
import { logger } from '@/lib/logging/logger';

const globalForRedis = globalThis as unknown as { redis: Redis | undefined };

function createRedisClient(): Redis {
  const url = process.env.REDIS_URL;
  if (!url) {
    throw new Error('REDIS_URL environment variable is required');
  }

  return new Redis(url, {
    maxRetriesPerRequest: 3,
    enableReadyCheck: true,
    lazyConnect: false,
  });
}

export const redis =
  globalForRedis.redis ?? createRedisClient();

redis.on('error', (err) => {
  logger.error({ message: err.message }, '[Redis] Connection error');
});

redis.on('connect', () => {
  logger.info('[Redis] Connected');
});

if (process.env.NODE_ENV !== 'production') {
  globalForRedis.redis = redis;
}

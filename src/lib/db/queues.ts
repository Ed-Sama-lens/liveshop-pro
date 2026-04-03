import Bull from 'bull';

function createQueue<T>(name: string): Bull.Queue<T> {
  const redisUrl = process.env.REDIS_URL;
  if (!redisUrl) {
    throw new Error('REDIS_URL environment variable is required for Bull queues');
  }

  return new Bull<T>(name, redisUrl, {
    defaultJobOptions: {
      removeOnComplete: 100,
      removeOnFail: 200,
      attempts: 3,
      backoff: {
        type: 'exponential',
        delay: 2000,
      },
    },
  });
}

export const orderQueue = createQueue<Record<string, unknown>>('orders');
export const messageQueue = createQueue<Record<string, unknown>>('messages');
export const inventoryQueue = createQueue<Record<string, unknown>>('inventory');
export const analyticsQueue = createQueue<Record<string, unknown>>('analytics');

export const allQueues = [orderQueue, messageQueue, inventoryQueue, analyticsQueue] as const;

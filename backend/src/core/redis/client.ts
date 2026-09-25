import Redis from 'ioredis';

export function sanitizeRedisUrl(rawUrl?: string): string {
  if (!rawUrl) return 'redis://localhost:6379';
  let url = rawUrl.trim();
  // Strip enclosing quotes if any
  if ((url.startsWith('"') && url.endsWith('"')) || (url.startsWith("'") && url.endsWith("'"))) {
    url = url.slice(1, -1).trim();
  }
  // If user pasted "redis-cli --tls -u redis://..." or multiple tokens, extract the real URL
  const matches = url.match(/rediss?:\/\/[^\s'"]+/g);
  if (matches && matches.length > 0) {
    url = matches[matches.length - 1];
  }
  // Upstash uses TLS, convert redis:// to rediss:// if pointing to upstash.io
  if (url.includes('.upstash.io') && url.startsWith('redis://')) {
    url = url.replace('redis://', 'rediss://');
  }
  return url;
}

const redisUrl = sanitizeRedisUrl(process.env.REDIS_URL);
const isTls = redisUrl.startsWith('rediss://');

const defaultOptions: any = {
  maxRetriesPerRequest: null,
  enableReadyCheck: true,
  retryStrategy(times: number) {
    const delay = Math.min(times * 200, 5000);
    return delay;
  },
  ...(isTls ? { tls: { rejectUnauthorized: false } } : {}),
};

// maxRetriesPerRequest: null is REQUIRED by BullMQ
export const redis = new Redis(redisUrl, defaultOptions);

redis.on('error', (err) => {
  console.error('Redis connection error:', err.message);
});

redis.on('connect', () => {
  console.log('✓ Redis connected');
});

/**
 * Create a new Redis connection for BullMQ workers.
 * Each worker needs its own connection (BullMQ requirement).
 */
export function createRedisConnection(): Redis {
  return new Redis(redisUrl, defaultOptions);
}

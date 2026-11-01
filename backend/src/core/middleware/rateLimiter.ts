import { Request, Response, NextFunction } from 'express';
import { redis } from '../redis/client.js';
import { RateLimitError } from '../errors/index.js';
import type { AuthenticatedRequest } from '../types/index.js';

interface RateLimitOptions {
  windowMs: number;   // Window size in milliseconds
  maxRequests: number; // Max requests per window
  keyPrefix?: string;  // Redis key prefix
}

// The shared client queues commands forever while disconnected (maxRetriesPerRequest: null),
// so give up quickly and fail open instead of hanging the request
const REDIS_TIMEOUT_MS = 1000;

/**
 * Redis-backed sliding window rate limiter.
 * Per-user when authenticated, per-IP when not.
 */
export function rateLimiter(options: RateLimitOptions) {
  const {
    windowMs,
    maxRequests,
    keyPrefix = 'rl',
  } = options;

  return async (req: Request, _res: Response, next: NextFunction): Promise<void> => {
    if (!['ready', 'connect', 'connecting'].includes(redis.status)) {
      next();
      return;
    }

    let timer: NodeJS.Timeout | undefined;
    try {
      // Use userId if authenticated, otherwise IP
      const identifier =
        'userId' in req
          ? (req as AuthenticatedRequest).userId
          : req.ip || req.socket.remoteAddress || 'unknown';

      const key = `${keyPrefix}:${identifier}`;
      const now = Date.now();
      const windowStart = now - windowMs;

      // Sliding window using a Redis sorted set
      const pipeline = redis.pipeline();
      pipeline.zremrangebyscore(key, 0, windowStart); // Remove old entries
      pipeline.zadd(key, now.toString(), `${now}-${Math.random()}`); // Add current
      pipeline.zcard(key); // Count entries in window
      pipeline.expire(key, Math.ceil(windowMs / 1000)); // TTL

      const results = await Promise.race([
        pipeline.exec(),
        new Promise<null>((resolve) => {
          timer = setTimeout(() => resolve(null), REDIS_TIMEOUT_MS);
        }),
      ]);
      if (!results) {
        next();
        return;
      }

      const requestCount = results[2]?.[1] as number;

      if (requestCount > maxRequests) {
        throw new RateLimitError(
          `Rate limit exceeded. Max ${maxRequests} requests per ${windowMs / 1000}s.`
        );
      }

      next();
    } catch (error) {
      if (error instanceof RateLimitError) {
        next(error);
        return;
      }
      // If Redis is down, fail open (allow the request)
      console.error('Rate limiter error (failing open):', error);
      next();
    } finally {
      if (timer) clearTimeout(timer);
    }
  };
}

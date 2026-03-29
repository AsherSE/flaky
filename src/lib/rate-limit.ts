import { redis } from "./redis";

/**
 * Redis-based sliding-window rate limiter.
 * Returns true if the request is allowed, false if rate-limited.
 */
export async function rateLimit(
  key: string,
  maxAttempts: number,
  windowSec: number
): Promise<boolean> {
  const current = await redis.incr(key);
  if (current === 1) {
    await redis.expire(key, windowSec);
  }
  return current <= maxAttempts;
}

export function rateLimitError(retryAfterSec = 60) {
  return {
    error: "Too many requests. Please wait a moment and try again.",
    retryAfter: retryAfterSec,
  };
}

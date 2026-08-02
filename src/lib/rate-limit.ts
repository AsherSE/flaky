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

/**
 * Like rateLimit, but spends `amount` of the budget rather than one.
 *
 * Counting requests is the wrong unit when a single request can fan out — one
 * "Send individually" on a large plan is one call and many texts. This counts
 * the texts.
 *
 * Returns false when the spend would exceed `max`; the amount is still counted,
 * so repeatedly overshooting keeps the caller locked out for the window rather
 * than letting them retry their way through.
 */
export async function consumeQuota(
  key: string,
  amount: number,
  max: number,
  windowSec: number
): Promise<boolean> {
  if (amount <= 0) return true;
  const total = await redis.incrby(key, amount);
  if (total === amount) {
    await redis.expire(key, windowSec);
  }
  return total <= max;
}

export function rateLimitError(retryAfterSec = 60) {
  return {
    error: "Too many requests. Please wait a moment and try again.",
    retryAfter: retryAfterSec,
  };
}

/** Bearer session lifetime in Redis. Refreshed on each successful GET /api/session. */
export const SESSION_TTL_SEC = 60 * 60 * 24 * 30; // 30 days

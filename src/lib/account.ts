import { redis } from "@/lib/redis";
import { profileKey } from "@/lib/profile";
import { SESSION_TTL_SEC } from "@/lib/session-ttl";
import { removeFromPlan, userPlansKey } from "@/lib/plan";
import { migrateLegacyPlansForUser } from "@/lib/legacy-plans";

export function sessionKey(token: string) {
  return `session:${token}`;
}

/**
 * Reverse index of a phone number's live session tokens. `session:{token}` only
 * maps one way, so without this we can't sign a user out of their other devices
 * when they delete their account.
 */
export function userSessionsKey(phoneE164: string) {
  return `userSessions:${phoneE164}`;
}

/** Record a freshly issued token so account deletion can revoke it later. */
export async function rememberSession(phoneE164: string, token: string) {
  const key = userSessionsKey(phoneE164);
  await redis.sadd(key, token);
  // Outlive any single session so the index never expires mid-life.
  await redis.expire(key, SESSION_TTL_SEC * 2);
}

/**
 * Erase everything we hold for a phone number: profile, every session, and
 * their place in every plan. Other people keep those plans; a plan is only
 * deleted once nobody is left in it.
 *
 * Safe to call twice: every step is a delete.
 */
export async function deleteAccount(phoneE164: string): Promise<void> {
  // Old-shape plans carry the number in their key names; bring them into the
  // new shape first so one removal path covers everything.
  await migrateLegacyPlansForUser(phoneE164);

  const plansIndex = userPlansKey(phoneE164);
  const planIds = await redis.smembers(plansIndex);
  await Promise.all(planIds.map((id) => removeFromPlan(id, phoneE164)));

  const sessionsIndex = userSessionsKey(phoneE164);
  const tokens = await redis.smembers(sessionsIndex);
  await Promise.all(tokens.map((t) => redis.del(sessionKey(t))));

  await Promise.all([
    redis.del(plansIndex),
    redis.del(sessionsIndex),
    redis.del(profileKey(phoneE164)),
  ]);
}

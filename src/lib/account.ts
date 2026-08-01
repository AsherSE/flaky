import { redis } from "@/lib/redis";
import { profileKey } from "@/lib/profile";
import { SESSION_TTL_SEC } from "@/lib/session-ttl";
import {
  flakeMetaKey,
  parseFlakeRedisKey,
  userFlakesIndexKey,
} from "@/lib/flake-keys";
import {
  getMeetingRecord,
  meetingRecordKey,
  userMeetingsKey,
} from "@/lib/meeting";

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
 * every meeting it takes part in.
 *
 * Meetings are removed outright rather than edited, because participant numbers
 * are encoded in the Redis key itself — there is no way to strip one person out
 * without rewriting the key, and a plan is meaningless once one side of it has
 * gone. Other participants lose the plan; they keep their own accounts.
 *
 * Safe to call twice: every step is a delete.
 */
export async function deleteAccount(phoneE164: string): Promise<void> {
  const flakesIndex = userFlakesIndexKey(phoneE164);
  const flakeKeys = await redis.smembers(flakesIndex);

  await Promise.all(
    flakeKeys.map(async (flakeKey) => {
      const parsed = parseFlakeRedisKey(flakeKey);
      await Promise.all([
        redis.del(flakeKey),
        redis.del(flakeMetaKey(flakeKey)),
      ]);
      if (!parsed) return;
      await Promise.all(
        parsed.participants.map((p) =>
          redis.srem(userFlakesIndexKey(p), flakeKey)
        )
      );
    })
  );

  // Invite-link records (`meeting:{id}`) hold participant numbers too, and are
  // keyed by a random id — only the per-user index can find them.
  const meetingsIndex = userMeetingsKey(phoneE164);
  const meetingIds = await redis.smembers(meetingsIndex);
  await Promise.all(
    meetingIds.map(async (id) => {
      const record = await getMeetingRecord(id);
      await redis.del(meetingRecordKey(id));
      if (!record) return;
      await Promise.all(
        record.participants.map((p) => redis.srem(userMeetingsKey(p), id))
      );
    })
  );

  const sessionsIndex = userSessionsKey(phoneE164);
  const tokens = await redis.smembers(sessionsIndex);
  await Promise.all(tokens.map((t) => redis.del(sessionKey(t))));

  await Promise.all([
    redis.del(flakesIndex),
    redis.del(meetingsIndex),
    redis.del(sessionsIndex),
    redis.del(profileKey(phoneE164)),
  ]);
}

/**
 * Redis key shapes for meetings ("flakes"), shared by the flake API and account
 * deletion. Keep these in one place: deletion has to purge exactly the keys the
 * API writes, and a drift between the two silently leaves personal data behind.
 *
 *   flake:{p1}:{p2}:…:{YYYY-MM-DD}  set of participants who opted to cancel
 *   flakeMeta:{flakeKey}            JSON blob, currently { timeOfDay }
 *   userFlakes:{phoneE164}          set of flakeKeys this user is part of
 */

export const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export function userFlakesIndexKey(phoneE164: string) {
  return `userFlakes:${phoneE164}`;
}

export function flakeMetaKey(flakeKey: string) {
  return `flakeMeta:${flakeKey}`;
}

/**
 * Participants are encoded in the key itself (E.164, so no colons of their
 * own). Returns null for anything that isn't a well-formed meeting key.
 */
export function parseFlakeRedisKey(flakeKey: string): {
  participants: string[];
  date: string;
} | null {
  const parts = flakeKey.split(":");
  if (parts.length < 4 || parts[0] !== "flake") return null;
  const date = parts[parts.length - 1]!.trim();
  if (!DATE_RE.test(date)) return null;
  const participants = parts.slice(1, -1);
  if (participants.length < 2) return null;
  return { participants, date };
}

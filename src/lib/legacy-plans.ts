import { createHash } from "node:crypto";
import { redis } from "@/lib/redis";
import {
  createPlan,
  expirePlanKeys,
  flakedKey,
  generatePlanId,
  getPlan,
  isTimeOfDay,
  mutualKey,
  userPlansKey,
} from "@/lib/plan";

/**
 * One-way migration from the old plan storage, where a plan was addressed by
 * its participants and date spelled out in the key:
 *
 *   flake:{p1}:{p2}:…:{YYYY-MM-DD}  set of participants who opted to cancel
 *   flakeMeta:{flakeKey}            JSON, { timeOfDay }
 *   userFlakes:{phoneE164}          set of flakeKeys this user is part of
 *   meeting:{id}                    JSON invite-link record { flakeKey, … }
 *   userMeetings:{phoneE164}        set of meeting ids
 *
 * Every one of those keys expired seven days after it was written, so nothing
 * of the old shape survives past 2026-10-08. Delete this file after that.
 */

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function parseFlakeKey(
  flakeKey: string
): { participants: string[]; date: string } | null {
  const parts = flakeKey.split(":");
  if (parts.length < 4 || parts[0] !== "flake") return null;
  const date = parts[parts.length - 1]!.trim();
  if (!DATE_RE.test(date)) return null;
  const participants = parts.slice(1, -1);
  if (participants.length < 2) return null;
  return { participants, date };
}

function asObject(raw: unknown): Record<string, unknown> | null {
  if (raw && typeof raw === "object") return raw as Record<string, unknown>;
  if (typeof raw === "string") {
    try {
      const v: unknown = JSON.parse(raw);
      return v && typeof v === "object" ? (v as Record<string, unknown>) : null;
    } catch {
      return null;
    }
  }
  return null;
}

/** New keys were Redis sets; the oldest were JSON arrays behind a plain GET. */
async function legacyFlaked(flakeKey: string): Promise<string[]> {
  try {
    const members = await redis.smembers(flakeKey);
    if (members.length > 0) return members;
  } catch {
    /* a legacy string value — fall through */
  }
  try {
    const raw = await redis.get<unknown>(flakeKey);
    if (Array.isArray(raw)) {
      return raw.filter((x): x is string => typeof x === "string" && !!x);
    }
  } catch {
    /* expired or corrupt */
  }
  return [];
}

/**
 * flakeKey → the new plan id it became. Guards against migrating it twice.
 * Hashed, because a flakeKey is a list of phone numbers.
 */
function migratedKey(flakeKey: string) {
  return `migrated:${createHash("sha256").update(flakeKey).digest("hex")}`;
}

/**
 * Convert one old plan into a new one and return its id. Safe to race: the
 * first caller claims the flakeKey, later callers get the id it chose.
 */
async function migrateFlakeKey(
  flakeKey: string,
  preferredId: string | null,
  creator: string
): Promise<string | null> {
  const parsed = parseFlakeKey(flakeKey);
  if (!parsed) return null;

  const candidate = preferredId ?? generatePlanId();
  const claimed = await redis.set(migratedKey(flakeKey), candidate, {
    nx: true,
    ex: 8 * 24 * 60 * 60,
  });
  if (claimed !== "OK") {
    const existing = await redis.get<string>(migratedKey(flakeKey));
    return existing ? String(existing) : null;
  }

  const [flaked, metaRaw] = await Promise.all([
    legacyFlaked(flakeKey),
    redis.get<unknown>(`flakeMeta:${flakeKey}`),
  ]);
  const tod = asObject(metaRaw)?.timeOfDay;

  await createPlan({
    id: candidate,
    createdBy: "",
    creatorName: creator,
    date: parsed.date,
    timeOfDay: isTimeOfDay(tod) ? tod : null,
    others: parsed.participants,
  });
  const live = flaked.filter((p) => parsed.participants.includes(p));
  if (live.length > 0) {
    await redis.sadd(flakedKey(candidate), live[0]!, ...live.slice(1));
  }
  // Already mutually cancelled: record it without texting everyone again.
  if (parsed.participants.every((p) => live.includes(p))) {
    await redis.set(mutualKey(candidate), "1");
  }
  await expirePlanKeys(candidate, parsed.date);

  await Promise.all([
    redis.del(flakeKey, `flakeMeta:${flakeKey}`),
    ...parsed.participants.map((p) => redis.srem(`userFlakes:${p}`, flakeKey)),
  ]);
  return candidate;
}

interface LegacyMeetingRecord {
  flakeKey: string;
  creator: string;
  participants: string[];
}

async function getLegacyMeetingRecord(
  id: string
): Promise<LegacyMeetingRecord | null> {
  const o = asObject(await redis.get<unknown>(`meeting:${id}`));
  if (!o || typeof o.flakeKey !== "string") return null;
  return {
    flakeKey: o.flakeKey,
    creator: typeof o.creator === "string" ? o.creator : "",
    participants: Array.isArray(o.participants)
      ? o.participants.filter((p): p is string => typeof p === "string")
      : [],
  };
}

async function dropLegacyMeetingRecord(id: string, rec: LegacyMeetingRecord) {
  await Promise.all([
    redis.del(`meeting:${id}`),
    ...rec.participants.map((p) => redis.srem(`userMeetings:${p}`, id)),
  ]);
}

/**
 * Move every old plan this number is in to the new shape. Called before
 * anything reads a user's plans, so callers only ever see new plans.
 */
export async function migrateLegacyPlansForUser(phone: string): Promise<void> {
  const [flakeKeys, meetingIds] = await Promise.all([
    redis.smembers(`userFlakes:${phone}`),
    redis.smembers(`userMeetings:${phone}`),
  ]);
  if (flakeKeys.length === 0 && meetingIds.length === 0) return;

  // Old invite links name a meeting id; reuse it so those links keep working.
  const byFlakeKey = new Map<string, { id: string; rec: LegacyMeetingRecord }>();
  await Promise.all(
    meetingIds.map(async (id) => {
      const rec = await getLegacyMeetingRecord(id);
      if (rec) byFlakeKey.set(rec.flakeKey, { id, rec });
    })
  );

  for (const flakeKey of flakeKeys) {
    const link = byFlakeKey.get(flakeKey);
    const id = await migrateFlakeKey(
      flakeKey,
      link?.id ?? null,
      link?.rec.creator ?? ""
    );
    if (id) {
      const plan = await getPlan(id);
      if (plan?.participants.includes(phone)) {
        await redis.sadd(userPlansKey(phone), id);
      }
    }
    if (link) await dropLegacyMeetingRecord(link.id, link.rec);
    await redis.srem(`userFlakes:${phone}`, flakeKey);
  }

  // Invite records whose plan has already expired or been migrated.
  for (const [flakeKey, { id, rec }] of Array.from(byFlakeKey.entries())) {
    if (!flakeKeys.includes(flakeKey)) await dropLegacyMeetingRecord(id, rec);
  }
  await redis.del(`userMeetings:${phone}`);
}

/**
 * Resolve an old `/m/<id>` invite link that nobody has migrated yet. Returns
 * true when the plan now exists under that id.
 */
export async function migrateLegacyInvite(id: string): Promise<boolean> {
  const rec = await getLegacyMeetingRecord(id);
  if (!rec) return false;
  const newId = await migrateFlakeKey(rec.flakeKey, id, rec.creator);
  await dropLegacyMeetingRecord(id, rec);
  return newId === id;
}

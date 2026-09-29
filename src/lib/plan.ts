import { redis } from "@/lib/redis";
import { MAX_FLAKE_TARGETS } from "@/lib/phone";

/**
 * A plan, addressed by an opaque id rather than by who is in it.
 *
 *   plan:{id}          hash  { date, timeOfDay, creator, createdBy, createdAt }
 *   plan:{id}:people   set   E.164 numbers in the plan
 *   plan:{id}:flaked   set   E.164 numbers who secretly want out
 *   plan:{id}:mutual   string, present once everyone has flaked
 *   userPlans:{phone}  set   plan ids this number is in
 *
 * People and flakes are Redis sets rather than fields of one JSON blob so that
 * joining and flaking are single atomic SADDs: two people tapping the invite
 * link at once can't overwrite each other.
 *
 * Nothing personal lives in a key name, so account deletion removes a person
 * from their plans instead of destroying the plans for everyone else.
 */

export type TimeOfDay = "morning" | "lunch" | "night";

const TIME_OF_DAY_VALUES = new Set<string>(["morning", "lunch", "night"]);
export function isTimeOfDay(v: unknown): v is TimeOfDay {
  return typeof v === "string" && TIME_OF_DAY_VALUES.has(v);
}

/** Most people one plan can hold, the creator included. */
export const MAX_PLAN_PEOPLE = MAX_FLAKE_TARGETS + 1;

export interface Plan {
  id: string;
  date: string;
  timeOfDay: TimeOfDay | null;
  /** Display name of whoever penciled it in, captured at creation. */
  creator: string;
  participants: string[];
  flaked: string[];
  /** Everyone wanted out, so the plan is off. */
  mutual: boolean;
}

const ID_RE = /^[0-9A-Za-z]{1,32}$/;

const ID_ALPHABET =
  "0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ";

/** Short, URL-safe, unguessable id (base62) — it doubles as the invite link. */
export function generatePlanId(length = 10): string {
  const bytes = new Uint8Array(length);
  crypto.getRandomValues(bytes);
  let out = "";
  for (let i = 0; i < length; i++) {
    out += ID_ALPHABET[bytes[i]! % ID_ALPHABET.length];
  }
  return out;
}

export function planKey(id: string) {
  return `plan:${id}`;
}
function peopleKey(id: string) {
  return `plan:${id}:people`;
}
export function flakedKey(id: string) {
  return `plan:${id}:flaked`;
}
export function mutualKey(id: string) {
  return `plan:${id}:mutual`;
}
export function userPlansKey(phoneE164: string) {
  return `userPlans:${phoneE164}`;
}

/** Plans may be penciled in up to 90 days out; the index has to outlive them. */
const USER_INDEX_TTL_SEC = 100 * 24 * 60 * 60;

/**
 * Keep a plan until two days after its date. Timezones run UTC-12..UTC+14, so
 * that is comfortably past the end of the day for everyone in it.
 */
function planExpiresAtSec(date: string): number {
  const [y, m, d] = date.split("-").map(Number);
  return Math.floor(Date.UTC(y!, m! - 1, d! + 2) / 1000);
}

/**
 * Pin every key of a plan to the plan's own lifetime. Call after creating a
 * key: a SADD that creates a set gives it no TTL.
 */
export async function expirePlanKeys(id: string, date: string) {
  const at = planExpiresAtSec(date);
  await Promise.all(
    [planKey(id), peopleKey(id), flakedKey(id), mutualKey(id)].map((k) =>
      redis.expireat(k, at)
    )
  );
}

async function indexPlanForUser(phone: string, id: string) {
  const key = userPlansKey(phone);
  await redis.sadd(key, id);
  await redis.expire(key, USER_INDEX_TTL_SEC);
}

export async function createPlan(input: {
  createdBy: string;
  creatorName: string;
  date: string;
  timeOfDay: TimeOfDay | null;
  others: string[];
  /** Reuse an existing id (legacy migration keeps old invite links working). */
  id?: string;
  createdAt?: number;
}): Promise<string> {
  const id = input.id ?? generatePlanId();
  const people = Array.from(new Set([input.createdBy, ...input.others])).filter(
    Boolean
  );

  await redis.hset(planKey(id), {
    date: input.date,
    timeOfDay: input.timeOfDay ?? "",
    creator: input.creatorName,
    createdBy: input.createdBy,
    createdAt: input.createdAt ?? Date.now(),
  });
  if (people.length > 0) {
    await redis.sadd(peopleKey(id), people[0]!, ...people.slice(1));
  }
  await expirePlanKeys(id, input.date);
  await Promise.all(people.map((p) => indexPlanForUser(p, id)));
  return id;
}

export async function getPlan(id: string): Promise<Plan | null> {
  if (!id || !ID_RE.test(id)) return null;
  const [meta, people, flaked, mutual] = await Promise.all([
    redis.hgetall<Record<string, unknown>>(planKey(id)),
    redis.smembers(peopleKey(id)),
    redis.smembers(flakedKey(id)),
    redis.exists(mutualKey(id)),
  ]);
  if (!meta || typeof meta.date !== "string") return null;

  return {
    id,
    date: meta.date,
    timeOfDay: isTimeOfDay(meta.timeOfDay) ? meta.timeOfDay : null,
    // Upstash deserialises values that look like JSON, so a name like "123"
    // comes back as a number.
    creator: meta.creator != null ? String(meta.creator) : "",
    participants: [...people].sort(),
    flaked: [...flaked].sort(),
    mutual: mutual > 0,
  };
}

export type JoinOutcome =
  | { status: "joined" | "already"; plan: Plan }
  | { status: "full" | "off"; plan: Plan }
  | { status: "not_found" };

/**
 * Add someone to a plan through its invite link. Anyone holding the link may
 * join: the id is unguessable, and whoever is in the chat is in the plan.
 */
export async function joinPlan(id: string, phone: string): Promise<JoinOutcome> {
  const plan = await getPlan(id);
  if (!plan) return { status: "not_found" };
  if (plan.participants.includes(phone)) return { status: "already", plan };
  if (plan.mutual) return { status: "off", plan };
  if (plan.participants.length >= MAX_PLAN_PEOPLE) {
    return { status: "full", plan };
  }

  await redis.sadd(peopleKey(id), phone);
  // Re-check after writing: a concurrent join may have filled the last seat,
  // or the last flake may have landed before our SADD was visible to it.
  const [count, mutual] = await Promise.all([
    redis.scard(peopleKey(id)),
    redis.exists(mutualKey(id)),
  ]);
  if (count > MAX_PLAN_PEOPLE || mutual > 0) {
    await redis.srem(peopleKey(id), phone);
    return { status: mutual > 0 ? "off" : "full", plan };
  }

  await indexPlanForUser(phone, id);
  const joined = await getPlan(id);
  return { status: "joined", plan: joined ?? plan };
}

/**
 * Mark `phone` as wanting out. Returns whether that made it mutual — and if so,
 * whether this call is the one that tipped it, so exactly one caller sends the
 * "you're all off the hook" texts.
 */
export async function flakePlan(
  id: string,
  phone: string
): Promise<
  | { ok: true; mutual: boolean; tipped: boolean; plan: Plan }
  | { ok: false; status: 404 }
> {
  const before = await getPlan(id);
  if (!before || !before.participants.includes(phone)) {
    return { ok: false, status: 404 };
  }
  if (before.mutual) return { ok: true, mutual: true, tipped: false, plan: before };

  await redis.sadd(flakedKey(id), phone);
  await redis.expireat(flakedKey(id), planExpiresAtSec(before.date));
  const plan = (await getPlan(id)) ?? before;

  // A plan nobody else has joined yet can't be "mutual" — there is nobody to
  // be mutual with.
  const everyoneOut =
    plan.participants.length >= 2 &&
    plan.participants.every((p) => plan.flaked.includes(p));
  if (!everyoneOut) return { ok: true, mutual: false, tipped: false, plan };

  const tipped =
    (await redis.set(mutualKey(id), "1", {
      nx: true,
      exat: planExpiresAtSec(plan.date),
    })) === "OK";
  return { ok: true, mutual: true, tipped, plan: { ...plan, mutual: true } };
}

/** Take back a flake. Refused once the plan is already mutually off. */
export async function unflakePlan(
  id: string,
  phone: string
): Promise<{ ok: true } | { ok: false; status: 404 | 409 }> {
  const plan = await getPlan(id);
  if (!plan || !plan.participants.includes(phone)) {
    return { ok: false, status: 404 };
  }
  if (plan.mutual) return { ok: false, status: 409 };

  await redis.srem(flakedKey(id), phone);
  // The last flake may have landed between our read and our SREM, counting us
  // as out. The texts are already sent, so keep the record consistent with them.
  if ((await redis.exists(mutualKey(id))) > 0) {
    await redis.sadd(flakedKey(id), phone);
    return { ok: false, status: 409 };
  }
  return { ok: true };
}

export async function deletePlan(id: string, participants: string[]) {
  await Promise.all([
    redis.del(planKey(id), peopleKey(id), flakedKey(id), mutualKey(id)),
    ...participants.map((p) => redis.srem(userPlansKey(p), id)),
  ]);
}

/**
 * Take someone out of a plan entirely (account deletion). Other people keep
 * the plan; it is only deleted once nobody is left in it.
 */
export async function removeFromPlan(id: string, phone: string) {
  await Promise.all([
    redis.srem(peopleKey(id), phone),
    redis.srem(flakedKey(id), phone),
    redis.srem(userPlansKey(phone), id),
  ]);
  const createdBy = await redis.hget<unknown>(planKey(id), "createdBy");
  if (createdBy != null && String(createdBy) === phone) {
    await redis.hset(planKey(id), { createdBy: "", creator: "Someone" });
  }
  if ((await redis.scard(peopleKey(id))) === 0) {
    await deletePlan(id, []);
  }
}

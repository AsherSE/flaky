import { createHash } from "node:crypto";
import { redis } from "@/lib/redis";
import { DATE_RE } from "@/lib/flake-keys";
import { generateMeetingId } from "@/lib/meeting";

/**
 * Plans created from the iMessage drawer app.
 *
 * Deliberately separate from phone-number plans: the extension never learns
 * anyone's number. Messages gives each person an opaque per-device participant
 * id instead, and the plan travels in the bubble itself. So the server holds
 * only a date, a group size and a set of hashed ids — nothing personal.
 *
 *   imPlan:{id}          JSON { date, timeOfDay, size, createdAt }
 *   imPlanFlaked:{id}    set of sha256(participant id) who secretly flaked
 *   imPlanAnnounced:{id} set-once flag: whoever wins it posts "plan's off"
 *
 * A plan is off when everyone has flaked, i.e. the flaked set reaches `size`
 * (the conversation's headcount when the plan was dropped in). Until then the
 * server reveals nothing beyond whether *you* flaked.
 */

export type TimeOfDay = "morning" | "lunch" | "night";
const TIME_OF_DAY = new Set<string>(["morning", "lunch", "night"]);

export interface IMessagePlan {
  date: string;
  timeOfDay: TimeOfDay | null;
  size: number;
  createdAt: number;
}

export interface IMessagePlanStatus {
  youFlaked: boolean;
  cancelled: boolean;
}

export const MIN_SIZE = 2;
/** iMessage groups top out at 32 people. */
export const MAX_SIZE = 32;

const SEVEN_DAYS = 7 * 24 * 60 * 60;
const ID_RE = /^[0-9A-Za-z]{1,32}$/;
/** Messages participant ids are UUIDs; accept nothing else. */
const VOTER_RE =
  /^[0-9A-Fa-f]{8}-[0-9A-Fa-f]{4}-[0-9A-Fa-f]{4}-[0-9A-Fa-f]{4}-[0-9A-Fa-f]{12}$/;

const planKey = (id: string) => `imPlan:${id}`;
const flakedKey = (id: string) => `imPlanFlaked:${id}`;
const announcedKey = (id: string) => `imPlanAnnounced:${id}`;

export function isPlanId(id: unknown): id is string {
  return typeof id === "string" && ID_RE.test(id);
}

export function isVoterId(v: unknown): v is string {
  return typeof v === "string" && VOTER_RE.test(v);
}

export function parseTimeOfDay(v: unknown): TimeOfDay | null {
  return typeof v === "string" && TIME_OF_DAY.has(v) ? (v as TimeOfDay) : null;
}

export function isPlanDate(v: unknown): v is string {
  if (typeof v !== "string" || !DATE_RE.test(v)) return false;
  const t = Date.parse(`${v}T00:00:00Z`);
  if (Number.isNaN(t)) return false;
  // Loose window: the device's date picker enforces "today or later" in the
  // user's own timezone; the server only rejects nonsense.
  const day = 24 * 60 * 60 * 1000;
  return t >= Date.now() - 2 * day && t <= Date.now() + 366 * day;
}

/** Store the raw participant id nowhere, not even in a set member. */
function hashVoter(voter: string): string {
  return createHash("sha256").update(voter.toLowerCase()).digest("hex");
}

export async function createIMessagePlan(input: {
  date: string;
  timeOfDay: TimeOfDay | null;
  size: number;
}): Promise<string> {
  const id = generateMeetingId();
  const plan: IMessagePlan = { ...input, createdAt: Date.now() };
  await redis.set(planKey(id), JSON.stringify(plan), { ex: SEVEN_DAYS });
  return id;
}

export async function getIMessagePlan(
  id: string
): Promise<IMessagePlan | null> {
  if (!isPlanId(id)) return null;
  const raw = await redis.get<unknown>(planKey(id));
  if (!raw) return null;
  // Upstash may return an already-parsed object or a JSON string.
  let obj: unknown = raw;
  if (typeof raw === "string") {
    try {
      obj = JSON.parse(raw);
    } catch {
      return null;
    }
  }
  if (!obj || typeof obj !== "object") return null;
  const o = obj as Record<string, unknown>;
  if (typeof o.date !== "string" || !DATE_RE.test(o.date)) return null;
  if (typeof o.size !== "number") return null;
  return {
    date: o.date,
    timeOfDay: parseTimeOfDay(o.timeOfDay),
    size: o.size,
    createdAt: typeof o.createdAt === "number" ? o.createdAt : 0,
  };
}

export async function getIMessagePlanStatus(
  id: string,
  plan: IMessagePlan,
  voter: string
): Promise<IMessagePlanStatus> {
  const [mine, count] = await Promise.all([
    redis.sismember(flakedKey(id), hashVoter(voter)),
    redis.scard(flakedKey(id)),
  ]);
  return { youFlaked: mine === 1, cancelled: count >= plan.size };
}

/**
 * Flake (or un-flake) one participant. Once a plan is off it stays off —
 * un-flaking afterwards would un-cancel a plan people were already told about.
 *
 * `announce` is true for exactly one caller: the one whose flake completed the
 * set. That device posts the "plan's off" bubble, so two people flaking at the
 * same moment don't both post it.
 */
export async function setIMessageFlake(
  id: string,
  plan: IMessagePlan,
  voter: string,
  flaked: boolean
): Promise<IMessagePlanStatus & { announce: boolean }> {
  const key = flakedKey(id);
  const member = hashVoter(voter);

  const before = await redis.scard(key);
  if (before >= plan.size) {
    const mine = await redis.sismember(key, member);
    return { youFlaked: mine === 1, cancelled: true, announce: false };
  }

  if (!flaked) {
    await redis.srem(key, member);
    return { youFlaked: false, cancelled: false, announce: false };
  }

  await redis.sadd(key, member);
  await redis.expire(key, SEVEN_DAYS);
  const count = await redis.scard(key);
  if (count < plan.size) {
    return { youFlaked: true, cancelled: false, announce: false };
  }

  const won = await redis.set(announcedKey(id), "1", {
    nx: true,
    ex: SEVEN_DAYS,
  });
  return { youFlaked: true, cancelled: true, announce: won === "OK" };
}

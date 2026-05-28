import { redis } from "@/lib/redis";

/**
 * A meeting's stable identity. Today a meeting is addressed in Redis by its
 * sorted participant list baked into the key (`flake:+1...:+1...:date`), which
 * changes the moment someone joins. A meeting *record* gives each meeting a
 * stable id that survives the participant set growing — the foundation for
 * shareable invite links (`/m/<id>`) and, later, join-to-expand.
 */
export interface MeetingRecord {
  flakeKey: string;
  participants: string[];
  date: string;
  /** Display name of whoever penciled it in, captured at creation. */
  creator: string;
}

const SEVEN_DAYS = 7 * 24 * 60 * 60;

export function meetingRecordKey(id: string): string {
  return `meeting:${id}`;
}

const ID_ALPHABET =
  "0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ";

/** Short, URL-safe, unguessable id (base62) for invite links. */
export function generateMeetingId(length = 10): string {
  const bytes = new Uint8Array(length);
  crypto.getRandomValues(bytes);
  let out = "";
  for (let i = 0; i < length; i++) {
    out += ID_ALPHABET[bytes[i]! % ID_ALPHABET.length];
  }
  return out;
}

/** Store a meeting record and return its id. Expires alongside the flake key. */
export async function createMeetingRecord(
  record: MeetingRecord
): Promise<string> {
  const id = generateMeetingId();
  const key = meetingRecordKey(id);
  await redis.set(key, JSON.stringify(record));
  await redis.expire(key, SEVEN_DAYS);
  return id;
}

export async function getMeetingRecord(
  id: string
): Promise<MeetingRecord | null> {
  if (!id || !/^[0-9A-Za-z]{1,32}$/.test(id)) return null;
  const raw = await redis.get<unknown>(meetingRecordKey(id));
  if (!raw) return null;

  // Upstash may return an already-parsed object or a JSON string.
  const obj: unknown = typeof raw === "string" ? safeParse(raw) : raw;
  if (!obj || typeof obj !== "object") return null;
  const o = obj as Record<string, unknown>;

  const flakeKey = typeof o.flakeKey === "string" ? o.flakeKey : "";
  const date = typeof o.date === "string" ? o.date : "";
  const creator = typeof o.creator === "string" ? o.creator : "";
  const participants = Array.isArray(o.participants)
    ? o.participants.filter((p): p is string => typeof p === "string")
    : [];
  if (!flakeKey || !date || participants.length < 2) return null;

  return { flakeKey, participants, date, creator };
}

function safeParse(s: string): unknown {
  try {
    return JSON.parse(s);
  } catch {
    return null;
  }
}

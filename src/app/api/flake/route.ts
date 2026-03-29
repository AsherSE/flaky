import { NextRequest, NextResponse } from "next/server";
import { redis } from "@/lib/redis";
import {
  analyzeFlakeTargetInput,
  normalizePhone,
  resolvePhoneRegion,
} from "@/lib/phone";
import { getRandomMessage } from "@/lib/messages";
import { sendSMS } from "@/lib/twilio";
import { profileKey } from "@/lib/profile";

export const dynamic = "force-dynamic";

const SEVEN_DAYS = 7 * 24 * 60 * 60;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function userFlakesIndexKey(phone: string) {
  return `userFlakes:${phone}`;
}

function parseFlakeRedisKey(flakeKey: string): {
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

async function rememberUserFlaked(phone: string, flakeKey: string) {
  await redis.sadd(userFlakesIndexKey(phone), flakeKey);
  await redis.expire(userFlakesIndexKey(phone), SEVEN_DAYS);
}

function rawTargetSlotsFromBody(body: unknown): string[] | null {
  if (!body || typeof body !== "object") return null;
  const o = body as Record<string, unknown>;

  if (Array.isArray(o.targetPhones)) {
    return o.targetPhones.map((x) => (typeof x === "string" ? x : ""));
  }
  if (o.targetPhone != null) {
    return [typeof o.targetPhone === "string" ? o.targetPhone : ""];
  }
  if (Array.isArray(o.targets)) {
    return o.targets.map((row) => {
      if (!row || typeof row !== "object") return "";
      const r = row as Record<string, unknown>;
      return typeof r.phone === "string" ? r.phone : "";
    });
  }
  return null;
}

/**
 * Read flake members from Redis. New keys are Redis Sets (SMEMBERS);
 * legacy keys are JSON string arrays (GET + parse). Returns empty array on miss.
 */
async function getFlakeMembers(flakeKey: string): Promise<string[]> {
  try {
    const members = await redis.smembers(flakeKey);
    if (Array.isArray(members) && members.length > 0) return members;
  } catch {
    /* key may be a legacy string value — fall through */
  }
  try {
    const raw = await redis.get<unknown>(flakeKey);
    if (Array.isArray(raw)) {
      return raw.filter(
        (x): x is string => typeof x === "string" && x.length > 0
      );
    }
  } catch {
    /* expired or corrupt */
  }
  return [];
}

async function loadProfileNames(
  phones: string[]
): Promise<Record<string, string>> {
  const unique = Array.from(new Set(phones.filter(Boolean)));
  if (!unique.length) return {};

  const keys = unique.map((p) => profileKey(p));
  const values = await redis.mget<string[]>(...keys);
  const out: Record<string, string> = {};
  unique.forEach((p, i) => {
    const v = values[i];
    if (typeof v === "string" && v.length > 0) out[p] = v;
  });
  return out;
}

// ---------------------------------------------------------------------------
// GET — list my active flakes
// ---------------------------------------------------------------------------

export async function GET(req: NextRequest) {
  const authHeader = req.headers.get("authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const sessionToken = authHeader.slice(7);
  const myPhone = await redis.get<string>(`session:${sessionToken}`);
  if (!myPhone) {
    return NextResponse.json({ error: "Session expired" }, { status: 401 });
  }

  const indexKey = userFlakesIndexKey(myPhone);
  const flakeKeys = await redis.smembers(indexKey);
  const staleKeys: string[] = [];

  const items = await Promise.all(
    flakeKeys.map(async (flakeKey) => {
      const parsed = parseFlakeRedisKey(flakeKey);
      if (!parsed) {
        staleKeys.push(flakeKey);
        return null;
      }

      const flaked = await getFlakeMembers(flakeKey);
      if (flaked.length === 0 || !flaked.includes(myPhone)) {
        staleKeys.push(flakeKey);
        return null;
      }

      const total = parsed.participants.length;
      const cancelledCount = flaked.length;
      const everyoneIn = total > 0 && cancelledCount >= total;

      return {
        date: parsed.date,
        participants: parsed.participants,
        flakedParticipants: [...flaked],
        totalPeople: total,
        cancelledCount,
        mutual: everyoneIn,
      };
    })
  );

  if (staleKeys.length > 0) {
    redis.srem(indexKey, ...staleKeys).catch(() => {});
  }

  const list = items.filter(
    (x): x is NonNullable<typeof x> => x != null
  );
  list.sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0));

  const allParticipants = new Set<string>();
  for (const item of list) {
    for (const p of item.participants) allParticipants.add(p);
  }
  const profileNames = await loadProfileNames(Array.from(allParticipants));

  return NextResponse.json({ items: list, profileNames });
}

// ---------------------------------------------------------------------------
// POST — record a flake (atomic SADD)
// ---------------------------------------------------------------------------

export async function POST(req: NextRequest) {
  const authHeader = req.headers.get("authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const sessionToken = authHeader.slice(7);
  const myPhone = await redis.get<string>(`session:${sessionToken}`);
  if (!myPhone) {
    return NextResponse.json({ error: "Session expired" }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const o = body && typeof body === "object" ? (body as Record<string, unknown>) : {};
  const date = typeof o.date === "string" ? o.date.trim() : "";
  if (!DATE_RE.test(date)) {
    return NextResponse.json({ error: "Pick a valid date" }, { status: 400 });
  }

  const region = resolvePhoneRegion(
    o.defaultCountry,
    req.headers.get("accept-language"),
    req.headers.get("x-vercel-ip-country"),
  );
  const rawSlots = rawTargetSlotsFromBody(body);
  if (!rawSlots) {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }

  const analysis = analyzeFlakeTargetInput(rawSlots, region, myPhone);
  if (!analysis.ok) {
    return NextResponse.json({ error: analysis.error }, { status: 400 });
  }
  const targets = analysis.targetsE164;

  const participants = Array.from(new Set([myPhone, ...targets])).sort();
  const flakeKey = `flake:${participants.join(":")}:${date}`;

  await redis.sadd(flakeKey, myPhone);
  await redis.expire(flakeKey, SEVEN_DAYS);
  await rememberUserFlaked(myPhone, flakeKey);

  const flaked = await getFlakeMembers(flakeKey);
  const isMutual = participants.every((p) => flaked.includes(p));

  if (isMutual) {
    const message = getRandomMessage();
    const smsBody = `${message}\n\nYour plans for ${date} just got cancelled — and honestly, everyone wanted out. Guilt-free.\n\n— flaky`;
    await Promise.all(
      participants.map(async (to) => {
        try {
          await sendSMS(to, smsBody);
        } catch (e) {
          console.error("Failed to send notification SMS:", e);
        }
      })
    );
    return NextResponse.json({ mutual: true, message });
  }

  return NextResponse.json({ mutual: false, message: "" });
}

// ---------------------------------------------------------------------------
// DELETE — undo a flake (atomic SREM)
// ---------------------------------------------------------------------------

export async function DELETE(req: NextRequest) {
  const authHeader = req.headers.get("authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const sessionToken = authHeader.slice(7);
  const myPhone = await redis.get<string>(`session:${sessionToken}`);
  if (!myPhone) {
    return NextResponse.json({ error: "Session expired" }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  if (!body || typeof body !== "object") {
    return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  }

  const o = body as Record<string, unknown>;
  const date = typeof o.date === "string" ? o.date.trim() : "";
  if (!DATE_RE.test(date)) {
    return NextResponse.json({ error: "Invalid date" }, { status: 400 });
  }

  const rawParts = Array.isArray(o.participants) ? o.participants : null;
  if (!rawParts?.length) {
    return NextResponse.json(
      { error: "Invalid participants" },
      { status: 400 }
    );
  }

  const sorted = Array.from(
    new Set(
      rawParts
        .map((p) => (typeof p === "string" ? normalizePhone(p) : ""))
        .filter((p): p is string => !!p)
    )
  ).sort();

  if (sorted.length < 2 || !sorted.includes(myPhone)) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const flakeKey = `flake:${sorted.join(":")}:${date}`;

  const flaked = await getFlakeMembers(flakeKey);
  if (flaked.length > 0) {
    const isMutual = sorted.every((p) => flaked.includes(p));
    if (isMutual) {
      return NextResponse.json(
        { error: "Cannot undo — everyone already agreed to cancel" },
        { status: 409 }
      );
    }
  }

  await redis.srem(userFlakesIndexKey(myPhone), flakeKey);
  await redis.srem(flakeKey, myPhone);

  return NextResponse.json({ ok: true });
}

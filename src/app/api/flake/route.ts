import { NextRequest, NextResponse } from "next/server";
import { redis } from "@/lib/redis";
import {
  analyzeFlakeTargetInput,
  normalizePhone,
  resolvePhoneRegion,
  type CountryCode,
} from "@/lib/phone";
import { getRandomMessage } from "@/lib/messages";
import { sendSMS } from "@/lib/twilio";
import { profileKey } from "@/lib/profile";

export const dynamic = "force-dynamic";

const SEVEN_DAYS = 7 * 24 * 60 * 60;

function userFlakesIndexKey(phone: string) {
  return `userFlakes:${phone}`;
}

/** Parse `flake:+p1:+p2:YYYY-MM-DD` — phones are +digits only so they never contain `:`. */
function parseFlakeRedisKey(flakeKey: string): {
  participants: string[];
  date: string;
} | null {
  const parts = flakeKey.split(":");
  if (parts.length < 4 || parts[0] !== "flake") return null;
  const date = parts[parts.length - 1]!.trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return null;
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

async function loadProfileNames(phones: string[]): Promise<Record<string, string>> {
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

      const raw = await redis.get<unknown>(flakeKey);
      if (!Array.isArray(raw)) {
        staleKeys.push(flakeKey);
        return null;
      }

      const flaked = Array.from(
        new Set(
          raw.filter((x): x is string => typeof x === "string" && x.length > 0)
        )
      );
      if (!flaked.includes(myPhone)) {
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

  const body = await req.json();
  const { date } = body;
  const region = resolvePhoneRegion(
    body?.defaultCountry,
    req.headers.get("accept-language")
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

  if (!date) {
    return NextResponse.json(
      { error: "Pick a day" },
      { status: 400 }
    );
  }

  // Canonical key: sorted phones so the same group shares one record no matter who submits
  const participants = Array.from(new Set([myPhone, ...targets])).sort();
  const flakeKey = `flake:${participants.join(":")}:${date}`;

  const existing = (await redis.get<string[]>(flakeKey)) ?? [];
  const uniqueExisting = Array.from(new Set(existing));

  function everyoneFlaked(flaked: string[]) {
    return participants.every((p) => flaked.includes(p));
  }

  // Already flaked — return current outcome
  if (uniqueExisting.includes(myPhone)) {
    await rememberUserFlaked(myPhone, flakeKey);
    const isMutual = everyoneFlaked(uniqueExisting);
    const message = isMutual ? getRandomMessage() : "";
    return NextResponse.json({ mutual: isMutual, message });
  }

  const updated = Array.from(new Set([...uniqueExisting, myPhone]));
  await redis.set(flakeKey, updated, { ex: SEVEN_DAYS });
  await rememberUserFlaked(myPhone, flakeKey);

  const isMutual = everyoneFlaked(updated);

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
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return NextResponse.json({ error: "Invalid date" }, { status: 400 });
  }

  const rawParts = Array.isArray(o.participants) ? o.participants : null;
  if (!rawParts?.length) {
    return NextResponse.json({ error: "Invalid participants" }, { status: 400 });
  }

  const sorted = Array.from(
    new Set(
      rawParts
        .map((p) => (typeof p === "string" ? normalizePhone(p) : ""))
        .filter(Boolean)
    )
  ).sort();

  if (sorted.length < 2 || !sorted.includes(myPhone)) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const flakeKey = `flake:${sorted.join(":")}:${date}`;
  const raw = await redis.get<string[]>(flakeKey);

  if (Array.isArray(raw)) {
    const uniqueFlaked = Array.from(new Set(raw.filter(Boolean)));
    const isMutual = sorted.every((p) => uniqueFlaked.includes(p));
    if (isMutual) {
      return NextResponse.json(
        { error: "Cannot undo — everyone already agreed to cancel" },
        { status: 409 }
      );
    }
  }

  await redis.srem(userFlakesIndexKey(myPhone), flakeKey);

  if (Array.isArray(raw) && raw.includes(myPhone)) {
    const updated = raw.filter((p) => p !== myPhone);
    if (updated.length === 0) {
      await redis.del(flakeKey);
    } else {
      await redis.set(flakeKey, updated, { ex: SEVEN_DAYS });
    }
  }

  return NextResponse.json({ ok: true });
}

import { NextRequest, NextResponse } from "next/server";
import { redis } from "@/lib/redis";
import { normalizePhone } from "@/lib/phone";
import { getRandomMessage } from "@/lib/messages";
import { sendSMS } from "@/lib/twilio";

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

function participantSetFromBody(body: unknown): string[] | null {
  if (!body || typeof body !== "object") return null;
  const o = body as Record<string, unknown>;
  const rawList = Array.isArray(o.targetPhones)
    ? o.targetPhones
    : o.targetPhone != null
      ? [o.targetPhone]
      : null;
  if (!rawList) return null;

  const normalized = new Set<string>();
  for (const raw of rawList) {
    if (typeof raw !== "string") continue;
    const n = normalizePhone(raw);
    if (n) normalized.add(n);
  }
  return normalized.size ? Array.from(normalized) : null;
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

  const flakeKeys = await redis.smembers(userFlakesIndexKey(myPhone));
  const items = await Promise.all(
    flakeKeys.map(async (flakeKey) => {
      const parsed = parseFlakeRedisKey(flakeKey);
      if (!parsed) return null;

      const raw = await redis.get<unknown>(flakeKey);
      if (!Array.isArray(raw)) return null;

      const flaked = Array.from(
        new Set(
          raw.filter((x): x is string => typeof x === "string" && x.length > 0)
        )
      );
      if (!flaked.includes(myPhone)) return null;

      const total = parsed.participants.length;
      const cancelledCount = flaked.length;
      const everyoneIn = total > 0 && cancelledCount >= total;

      return {
        date: parsed.date,
        totalPeople: total,
        cancelledCount,
        mutual: everyoneIn,
      };
    })
  );

  const list = items.filter(
    (x): x is NonNullable<typeof x> => x != null
  );
  list.sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0));

  return NextResponse.json({ items: list });
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
  const targets = participantSetFromBody(body);

  if (!targets?.length) {
    return NextResponse.json(
      { error: "Enter at least one valid phone number" },
      { status: 400 }
    );
  }

  if (targets.includes(myPhone)) {
    return NextResponse.json(
      { error: "You can't flake on yourself (but we respect the honesty)" },
      { status: 400 }
    );
  }

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

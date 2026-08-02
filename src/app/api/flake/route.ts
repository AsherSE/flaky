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
import { rateLimit, rateLimitError } from "@/lib/rate-limit";
import { createMeetingRecord } from "@/lib/meeting";
import {
  DATE_RE,
  flakeMetaKey,
  parseFlakeRedisKey,
  userFlakesIndexKey,
} from "@/lib/flake-keys";

export const dynamic = "force-dynamic";

const SEVEN_DAYS = 7 * 24 * 60 * 60;

type MeetingTimeOfDay = "morning" | "lunch" | "night";
const TIME_OF_DAY_VALUES = new Set<MeetingTimeOfDay>([
  "morning",
  "lunch",
  "night",
]);
function isTimeOfDay(v: unknown): v is MeetingTimeOfDay {
  return typeof v === "string" && TIME_OF_DAY_VALUES.has(v as MeetingTimeOfDay);
}

function ymdIn(tz: string): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: tz,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

/**
 * Calendar "today" for plan dates (YYYY-MM-DD), in the caller's own timezone.
 *
 * "Today" is not a server-side fact. At 6pm in Los Angeles it is already
 * tomorrow in UTC, so validating against a single server timezone rejects the
 * user's own today — the exact date the UI offers by default. The client sends
 * its IANA zone; we fall back to FLAKY_PLAN_DATE_TZ, then UTC, for old clients.
 */
function planCalendarTodayYmd(clientTz?: unknown): string {
  const candidates = [
    typeof clientTz === "string" ? clientTz.trim() : "",
    process.env.FLAKY_PLAN_DATE_TZ?.trim() || "",
    "UTC",
  ];
  for (const tz of candidates) {
    if (!tz) continue;
    try {
      return ymdIn(tz);
    } catch {
      /* not a valid IANA zone — try the next */
    }
  }
  return ymdIn("UTC");
}

/**
 * The most recent date that is in the past *everywhere*. Timezones span
 * UTC-12..UTC+14, so a local date can trail UTC by one day; pruning on UTC's
 * today would delete plans that are still happening for their owners.
 */
function definitelyPastBeforeYmd(): string {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - 1);
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "UTC",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(d);
}

/** Read the caller's IANA timezone from a request body, if it sent one. */
function clientTzFromBody(body: unknown): string | undefined {
  if (!body || typeof body !== "object") return undefined;
  const tz = (body as Record<string, unknown>).tz;
  return typeof tz === "string" && tz ? tz : undefined;
}

/** Remove meeting data and drop the key from every participant's index. */
async function pruneFlakeEverywhere(
  flakeKey: string,
  participants: string[]
): Promise<void> {
  await Promise.all([redis.del(flakeKey), redis.del(flakeMetaKey(flakeKey))]);
  await Promise.all(
    participants.map((p) => redis.srem(userFlakesIndexKey(p), flakeKey))
  );
}

async function indexMeetingForUser(phone: string, flakeKey: string) {
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
 * Read flake members (who opted to cancel) from Redis. New keys are Redis Sets
 * (SMEMBERS); legacy keys are JSON string arrays (GET + parse). Returns empty
 * array on miss — which means nobody has cancelled yet.
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

function resolveParticipantsFromBody(
  body: unknown,
  myPhone: string,
  req: NextRequest
): { sorted: string[]; flakeKey: string; date: string } | NextResponse {
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
  return { sorted, flakeKey, date };
}

// ---------------------------------------------------------------------------
// GET — list all my meetings
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
  // Deleting is destructive and GET carries no timezone, so prune only what is
  // past everywhere. A plan that is still "today" for its owner must survive.
  const todayYmd = definitelyPastBeforeYmd();

  const items = await Promise.all(
    flakeKeys.map(async (flakeKey) => {
      const parsed = parseFlakeRedisKey(flakeKey);
      if (!parsed) {
        staleKeys.push(flakeKey);
        return null;
      }

      if (parsed.date < todayYmd) {
        await pruneFlakeEverywhere(flakeKey, parsed.participants);
        return null;
      }

      const [flaked, meta] = await Promise.all([
        getFlakeMembers(flakeKey),
        redis.get<unknown>(flakeMetaKey(flakeKey)),
      ]);

      const total = parsed.participants.length;
      const cancelledCount = flaked.length;
      const everyoneIn = total > 0 && cancelledCount >= total;

      let timeOfDay: MeetingTimeOfDay | null = null;
      if (meta && typeof meta === "object") {
        const tod = (meta as Record<string, unknown>).timeOfDay;
        if (isTimeOfDay(tod)) timeOfDay = tod;
      } else if (typeof meta === "string") {
        try {
          const parsedMeta: unknown = JSON.parse(meta);
          if (parsedMeta && typeof parsedMeta === "object") {
            const tod = (parsedMeta as Record<string, unknown>).timeOfDay;
            if (isTimeOfDay(tod)) timeOfDay = tod;
          }
        } catch {
          /* ignore */
        }
      }

      return {
        date: parsed.date,
        participants: parsed.participants,
        flakedParticipants: [...flaked],
        totalPeople: total,
        cancelledCount,
        mutual: everyoneIn,
        timeOfDay,
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
// POST — "Pencil In" (create meeting, no auto-cancel)
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
  if (date < planCalendarTodayYmd(clientTzFromBody(body))) {
    return NextResponse.json(
      { error: "Pick today or a future date" },
      { status: 400 }
    );
  }

  // Creating plans is cheap for the caller and not for us: each one writes a
  // meeting record plus an index entry per participant.
  const pencilOk = await rateLimit(`rl:pencil:${myPhone}`, 20, 3600);
  if (!pencilOk) {
    return NextResponse.json(rateLimitError(600), { status: 429 });
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

  const timeOfDayRaw = (o as Record<string, unknown>).timeOfDay;
  const timeOfDay = isTimeOfDay(timeOfDayRaw) ? timeOfDayRaw : null;

  const participants = Array.from(new Set([myPhone, ...targets])).sort();
  const flakeKey = `flake:${participants.join(":")}:${date}`;

  await Promise.all(participants.map((p) => indexMeetingForUser(p, flakeKey)));

  if (timeOfDay) {
    const metaKey = flakeMetaKey(flakeKey);
    await redis.set(metaKey, JSON.stringify({ timeOfDay }));
    await redis.expire(metaKey, SEVEN_DAYS);
  } else {
    await redis.del(flakeMetaKey(flakeKey)).catch(() => {});
  }

  const creatorName = await redis.get<string>(profileKey(myPhone));
  const who = creatorName || "Someone";

  // Give the meeting a stable id so it can be shared as an invite link
  // (/m/<id>) that lands the opener on this specific plan — the groundwork
  // for forwarding a meeting and growing the group later.
  let meetingId: string | null = null;
  try {
    meetingId = await createMeetingRecord({
      flakeKey,
      participants,
      date,
      creator: who,
    });
  } catch (e) {
    console.error("Failed to create meeting record:", e);
  }

  // Note: we no longer auto-text invitees here. Inviting is now an explicit
  // choice on the result screen \u2014 "Send to group" (native composer, from the
  // user) or "Send individually" (Twilio, via POST /api/flake/notify).
  return NextResponse.json({
    penciled: true,
    meetingId,
    inviteUrl: meetingId ? `https://flaky.me/m/${meetingId}` : null,
  });
}

// ---------------------------------------------------------------------------
// PUT — opt to cancel (the X button)
// ---------------------------------------------------------------------------

export async function PUT(req: NextRequest) {
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

  const result = resolveParticipantsFromBody(body, myPhone, req);
  if (result instanceof NextResponse) return result;
  const { sorted, flakeKey, date } = result;

  if (date < planCalendarTodayYmd(clientTzFromBody(body))) {
    // Participants can sit in different zones, so one person's "past" is not
    // everyone's — only actually delete once it is past for all of them.
    if (date < definitelyPastBeforeYmd()) {
      await pruneFlakeEverywhere(flakeKey, sorted);
    }
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  await redis.sadd(flakeKey, myPhone);
  await redis.expire(flakeKey, SEVEN_DAYS);

  const flaked = await getFlakeMembers(flakeKey);
  const isMutual = sorted.every((p) => flaked.includes(p));

  if (isMutual) {
    const message = getRandomMessage();
    const smsBody = `flaky: ${message}\n\nYour plans for ${date} just got cancelled — and honestly, everyone wanted out. Guilt-free.\n\nReply STOP to opt out, HELP for help.`;
    await Promise.all(
      sorted.map(async (to) => {
        try {
          await sendSMS(to, smsBody);
        } catch (e) {
          console.error("Failed to send cancellation SMS:", e);
        }
      })
    );
    return NextResponse.json({ mutual: true, message });
  }

  return NextResponse.json({ mutual: false, message: "" });
}

// ---------------------------------------------------------------------------
// DELETE — undo cancel (keep user in meeting)
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

  const result = resolveParticipantsFromBody(body, myPhone, req);
  if (result instanceof NextResponse) return result;
  const { sorted, flakeKey, date } = result;

  if (date < planCalendarTodayYmd(clientTzFromBody(body))) {
    // Participants can sit in different zones, so one person's "past" is not
    // everyone's — only actually delete once it is past for all of them.
    if (date < definitelyPastBeforeYmd()) {
      await pruneFlakeEverywhere(flakeKey, sorted);
    }
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

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

  await redis.srem(flakeKey, myPhone);

  return NextResponse.json({ ok: true });
}

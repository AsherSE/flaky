import { NextRequest, NextResponse } from "next/server";
import { redis } from "@/lib/redis";
import { analyzeFlakeTargetInput, resolvePhoneRegion } from "@/lib/phone";
import { getRandomMessage } from "@/lib/messages";
import { sendSMS } from "@/lib/twilio";
import { profileKey } from "@/lib/profile";
import { rateLimit, rateLimitError } from "@/lib/rate-limit";
import { sessionPhone } from "@/lib/auth";
import {
  createPlan,
  deletePlan,
  flakePlan,
  getPlan,
  isTimeOfDay,
  unflakePlan,
  userPlansKey,
} from "@/lib/plan";
import { migrateLegacyPlansForUser } from "@/lib/legacy-plans";
import { inviteUrl } from "@/lib/invite";

export const dynamic = "force-dynamic";

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

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

async function readJson(req: NextRequest): Promise<Record<string, unknown> | null> {
  try {
    const body: unknown = await req.json();
    return body && typeof body === "object"
      ? (body as Record<string, unknown>)
      : {};
  } catch {
    return null;
  }
}

function rawTargetSlotsFromBody(o: Record<string, unknown>): string[] {
  if (Array.isArray(o.targetPhones)) {
    return o.targetPhones.map((x) => (typeof x === "string" ? x : ""));
  }
  if (o.targetPhone != null) {
    return [typeof o.targetPhone === "string" ? o.targetPhone : ""];
  }
  return [];
}

async function loadProfileNames(
  phones: string[]
): Promise<Record<string, string>> {
  const unique = Array.from(new Set(phones.filter(Boolean)));
  if (!unique.length) return {};

  const values = await redis.mget<unknown[]>(...unique.map((p) => profileKey(p)));
  const out: Record<string, string> = {};
  unique.forEach((p, i) => {
    const v = values[i];
    if (v != null && String(v).length > 0) out[p] = String(v);
  });
  return out;
}

// ---------------------------------------------------------------------------
// GET — list all my plans
// ---------------------------------------------------------------------------

export async function GET(req: NextRequest) {
  const myPhone = await sessionPhone(req);
  if (myPhone instanceof NextResponse) return myPhone;

  await migrateLegacyPlansForUser(myPhone);

  const indexKey = userPlansKey(myPhone);
  const ids = await redis.smembers(indexKey);
  const gone: string[] = [];
  // Deleting is destructive and GET carries no timezone, so prune only what is
  // past everywhere. A plan that is still "today" for its owner must survive.
  const pastBefore = definitelyPastBeforeYmd();

  const plans = await Promise.all(
    ids.map(async (id) => {
      const plan = await getPlan(id);
      if (!plan || !plan.participants.includes(myPhone)) {
        gone.push(id);
        return null;
      }
      if (plan.date < pastBefore) {
        await deletePlan(id, plan.participants);
        return null;
      }
      return plan;
    })
  );

  if (gone.length > 0) {
    redis.srem(indexKey, ...gone).catch(() => {});
  }

  const items = plans
    .filter((p): p is NonNullable<typeof p> => p != null)
    // Never send who else has flaked, or how many: the whole promise is that
    // nobody finds out unless everyone does. You only learn about yourself.
    .map((p) => ({
      id: p.id,
      date: p.date,
      participants: p.participants,
      totalPeople: p.participants.length,
      youFlaked: p.flaked.includes(myPhone),
      mutual: p.mutual,
      timeOfDay: p.timeOfDay,
      inviteUrl: inviteUrl(p.id),
    }));
  items.sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0));

  const profileNames = await loadProfileNames(
    items.flatMap((i) => i.participants)
  );

  return NextResponse.json({ items, profileNames });
}

// ---------------------------------------------------------------------------
// POST — "Pencil in" (create a plan). Numbers are optional: a plan can start
// with just you and fill up as people open its invite link.
// ---------------------------------------------------------------------------

export async function POST(req: NextRequest) {
  const myPhone = await sessionPhone(req);
  if (myPhone instanceof NextResponse) return myPhone;

  const o = await readJson(req);
  if (!o) return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });

  const date = typeof o.date === "string" ? o.date.trim() : "";
  if (!DATE_RE.test(date)) {
    return NextResponse.json({ error: "Pick a valid date" }, { status: 400 });
  }
  if (date < planCalendarTodayYmd(o.tz)) {
    return NextResponse.json(
      { error: "Pick today or a future date" },
      { status: 400 }
    );
  }

  // Creating plans is cheap for the caller and not for us: each one writes a
  // plan record plus an index entry per participant.
  const pencilOk = await rateLimit(`rl:pencil:${myPhone}`, 20, 3600);
  if (!pencilOk) {
    return NextResponse.json(rateLimitError(600), { status: 429 });
  }

  let targets: string[] = [];
  const rawSlots = rawTargetSlotsFromBody(o).filter((s) => s.trim());
  if (rawSlots.length > 0) {
    const region = resolvePhoneRegion(
      o.defaultCountry,
      req.headers.get("accept-language"),
      req.headers.get("x-vercel-ip-country"),
    );
    const analysis = analyzeFlakeTargetInput(rawSlots, region, myPhone);
    if (!analysis.ok) {
      return NextResponse.json({ error: analysis.error }, { status: 400 });
    }
    targets = analysis.targetsE164;
  }

  const creatorName = await redis.get<unknown>(profileKey(myPhone));

  const id = await createPlan({
    createdBy: myPhone,
    creatorName: creatorName != null && String(creatorName) ? String(creatorName) : "Someone",
    date,
    timeOfDay: isTimeOfDay(o.timeOfDay) ? o.timeOfDay : null,
    others: targets,
  });

  // We never auto-text invitees here. Inviting is an explicit choice on the
  // result screen — "Send to group" (native composer, from the user), sharing
  // the link, or "Send individually" (Twilio, via POST /api/flake/notify).
  return NextResponse.json({
    penciled: true,
    id,
    inviteUrl: inviteUrl(id),
  });
}

function planIdFromBody(o: Record<string, unknown>): string | null {
  return typeof o.id === "string" && o.id ? o.id : null;
}

// ---------------------------------------------------------------------------
// PUT — opt to cancel (flake)
// ---------------------------------------------------------------------------

export async function PUT(req: NextRequest) {
  const myPhone = await sessionPhone(req);
  if (myPhone instanceof NextResponse) return myPhone;

  const o = await readJson(req);
  if (!o) return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  const id = planIdFromBody(o);
  if (!id) return NextResponse.json({ error: "Missing id" }, { status: 400 });

  const plan = await getPlan(id);
  if (plan && plan.date < planCalendarTodayYmd(o.tz)) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const result = await flakePlan(id, myPhone);
  if (!result.ok) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  if (!result.mutual) {
    return NextResponse.json({ mutual: false, message: "" });
  }

  const message = getRandomMessage();
  // Only the flake that tipped it over texts everyone, so a race between the
  // last two flakers can't send the news twice.
  if (result.tipped) {
    const smsBody = `flaky: ${message}\n\nYour plans for ${result.plan.date} just got cancelled — and honestly, everyone wanted out. Guilt-free.\n\nReply STOP to opt out, HELP for help.`;
    await Promise.all(
      result.plan.participants.map(async (to) => {
        try {
          await sendSMS(to, smsBody);
        } catch (e) {
          console.error("Failed to send cancellation SMS:", e);
        }
      })
    );
  }
  return NextResponse.json({ mutual: true, message });
}

// ---------------------------------------------------------------------------
// DELETE — undo a flake (recommit)
// ---------------------------------------------------------------------------

export async function DELETE(req: NextRequest) {
  const myPhone = await sessionPhone(req);
  if (myPhone instanceof NextResponse) return myPhone;

  const o = await readJson(req);
  if (!o) return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  const id = planIdFromBody(o);
  if (!id) return NextResponse.json({ error: "Missing id" }, { status: 400 });

  const result = await unflakePlan(id, myPhone);
  if (!result.ok && result.status === 409) {
    return NextResponse.json(
      { error: "Cannot undo — everyone already agreed to cancel" },
      { status: 409 }
    );
  }
  if (!result.ok) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  return NextResponse.json({ ok: true });
}

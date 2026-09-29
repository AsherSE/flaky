import { NextRequest, NextResponse } from "next/server";
import { sessionPhone } from "@/lib/auth";
import { joinPlan, MAX_PLAN_PEOPLE } from "@/lib/plan";
import { migrateLegacyInvite } from "@/lib/legacy-plans";
import { rateLimit, rateLimitError } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";

/**
 * POST — join a plan through its invite link (`/m/<id>`). The link is the
 * permission: whoever it was shared with can add themselves.
 */
export async function POST(req: NextRequest) {
  const myPhone = await sessionPhone(req);
  if (myPhone instanceof NextResponse) return myPhone;

  let id = "";
  try {
    const body: unknown = await req.json();
    const raw =
      body && typeof body === "object"
        ? (body as Record<string, unknown>).id
        : undefined;
    id = typeof raw === "string" ? raw : "";
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  if (!id) return NextResponse.json({ error: "Missing id" }, { status: 400 });

  // Ids are unguessable, but don't hand anyone an oracle to probe them with.
  const ok = await rateLimit(`rl:join:${myPhone}`, 30, 3600);
  if (!ok) return NextResponse.json(rateLimitError(600), { status: 429 });

  let outcome = await joinPlan(id, myPhone);
  if (outcome.status === "not_found" && (await migrateLegacyInvite(id))) {
    outcome = await joinPlan(id, myPhone);
  }

  switch (outcome.status) {
    case "not_found":
      return NextResponse.json(
        { error: "This invite has expired or doesn’t exist anymore." },
        { status: 404 }
      );
    case "full":
      return NextResponse.json(
        { error: `This plan is full — plans hold up to ${MAX_PLAN_PEOPLE} people.` },
        { status: 409 }
      );
    case "off":
      return NextResponse.json(
        { error: "Too late — everyone in this plan already flaked, so it’s off." },
        { status: 409 }
      );
    default:
      return NextResponse.json({
        status: outcome.status,
        id: outcome.plan.id,
        date: outcome.plan.date,
        timeOfDay: outcome.plan.timeOfDay,
        creator: outcome.plan.creator,
      });
  }
}

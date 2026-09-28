import { NextRequest, NextResponse } from "next/server";
import { rateLimit, rateLimitError } from "@/lib/rate-limit";
import {
  getIMessagePlan,
  getIMessagePlanStatus,
  isVoterId,
  setIMessageFlake,
} from "@/lib/imessage-plan";

export const dynamic = "force-dynamic";

const notFound = () =>
  NextResponse.json(
    { error: "This plan has expired or doesn't exist." },
    { status: 404 }
  );

/** GET ?voter=<participant uuid> — what this person can see about the plan. */
export async function GET(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const voter = req.nextUrl.searchParams.get("voter");
  if (!isVoterId(voter)) {
    return NextResponse.json({ error: "Missing voter." }, { status: 400 });
  }
  const plan = await getIMessagePlan(params.id);
  if (!plan) return notFound();

  const status = await getIMessagePlanStatus(params.id, plan, voter);
  return NextResponse.json({ ...plan, ...status });
}

/** POST { voter, flaked } — secretly flake, or change your mind. */
export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const body = (await req.json().catch(() => null)) as Record<
    string,
    unknown
  > | null;
  const voter = body?.voter;
  if (!isVoterId(voter) || typeof body?.flaked !== "boolean") {
    return NextResponse.json({ error: "Bad request." }, { status: 400 });
  }

  // Per plan, not per IP: a whole group chat may share one carrier IP.
  if (!(await rateLimit(`rl:im:flake:${params.id}`, 60, 60 * 60))) {
    return NextResponse.json(rateLimitError(), { status: 429 });
  }

  const plan = await getIMessagePlan(params.id);
  if (!plan) return notFound();

  const result = await setIMessageFlake(params.id, plan, voter, body.flaked);
  return NextResponse.json(result);
}

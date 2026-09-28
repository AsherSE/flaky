import { NextRequest, NextResponse } from "next/server";
import { rateLimit, rateLimitError } from "@/lib/rate-limit";
import {
  MAX_SIZE,
  MIN_SIZE,
  createIMessagePlan,
  isPlanDate,
  parseTimeOfDay,
} from "@/lib/imessage-plan";

export const dynamic = "force-dynamic";

/**
 * Create a plan from the iMessage drawer app. No sign-in: the extension has no
 * phone number to verify, and the plan holds nothing personal. Rate limited by
 * IP so the endpoint can't be used to fill Redis.
 */
export async function POST(req: NextRequest) {
  const ip =
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
  if (!(await rateLimit(`rl:im:create:${ip}`, 30, 60 * 60))) {
    return NextResponse.json(rateLimitError(), { status: 429 });
  }

  const body = (await req.json().catch(() => null)) as Record<
    string,
    unknown
  > | null;
  const date = body?.date;
  const size = body?.size;

  if (!isPlanDate(date)) {
    return NextResponse.json({ error: "Pick a valid date." }, { status: 400 });
  }
  if (
    typeof size !== "number" ||
    !Number.isInteger(size) ||
    size < MIN_SIZE ||
    size > MAX_SIZE
  ) {
    return NextResponse.json(
      { error: "Plans need between 2 and 32 people." },
      { status: 400 }
    );
  }

  const id = await createIMessagePlan({
    date,
    timeOfDay: parseTimeOfDay(body?.timeOfDay),
    size,
  });
  return NextResponse.json({ id });
}

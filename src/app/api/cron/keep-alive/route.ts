import { NextRequest, NextResponse } from "next/server";
import { redis } from "@/lib/redis";

export const dynamic = "force-dynamic";

/**
 * Weekly ping so the free-tier Upstash database isn't archived for inactivity.
 * Vercel Cron sends `Authorization: Bearer $CRON_SECRET` when that env var is set.
 */
export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  await redis.ping();
  return NextResponse.json({ ok: true });
}

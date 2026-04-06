import { NextRequest, NextResponse } from "next/server";
import { redis } from "@/lib/redis";
import { profileKey } from "@/lib/profile";
import { SESSION_TTL_SEC } from "@/lib/session-ttl";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const authHeader = request.headers.get("authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const sessionToken = authHeader.slice(7);
  const phone = await redis.get<string>(`session:${sessionToken}`);
  if (!phone) {
    return NextResponse.json({ error: "Session expired" }, { status: 401 });
  }

  await redis.set(`session:${sessionToken}`, phone, { ex: SESSION_TTL_SEC });

  const name = await redis.get<string>(profileKey(phone));

  return NextResponse.json({
    phone,
    name: typeof name === "string" ? name : "",
  });
}

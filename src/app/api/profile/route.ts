import { NextRequest, NextResponse } from "next/server";
import { redis } from "@/lib/redis";
import { profileKey, PROFILE_TTL_SEC, sanitizeFirstName } from "@/lib/profile";

export const dynamic = "force-dynamic";

const SESSION_PREFIX = "session:";

export async function POST(req: NextRequest) {
  const authHeader = req.headers.get("authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const sessionToken = authHeader.slice(7);
  const phone = await redis.get<string>(`${SESSION_PREFIX}${sessionToken}`);
  if (!phone) {
    return NextResponse.json({ error: "Session expired" }, { status: 401 });
  }

  const body = await req.json();
  const name = sanitizeFirstName(body?.firstName);

  const key = profileKey(phone);
  if (name) {
    await redis.set(key, name, { ex: PROFILE_TTL_SEC });
  } else {
    await redis.del(key);
  }

  return NextResponse.json({ firstName: name ?? "" });
}

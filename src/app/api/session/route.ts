import { NextRequest, NextResponse } from "next/server";
import { redis } from "@/lib/redis";
import { profileKey } from "@/lib/profile";

export const dynamic = "force-dynamic";

const SESSION_TTL_SEC = 24 * 60 * 60;

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

  const firstName = await redis.get<string>(profileKey(phone));

  return NextResponse.json({
    phone,
    firstName: typeof firstName === "string" ? firstName : "",
  });
}

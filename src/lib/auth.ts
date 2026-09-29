import { NextRequest, NextResponse } from "next/server";
import { redis } from "@/lib/redis";

/** The signed-in phone number for a request, or the 401 to return instead. */
export async function sessionPhone(
  req: NextRequest
): Promise<string | NextResponse> {
  const authHeader = req.headers.get("authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const phone = await redis.get<string>(`session:${authHeader.slice(7)}`);
  if (!phone) {
    return NextResponse.json({ error: "Session expired" }, { status: 401 });
  }
  return phone;
}

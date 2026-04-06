import { NextRequest, NextResponse } from "next/server";
import { normalizePhone, resolvePhoneRegion } from "@/lib/phone";
import { checkVerification } from "@/lib/twilio";
import { redis } from "@/lib/redis";
import { SESSION_TTL_SEC } from "@/lib/session-ttl";
import { rateLimit, rateLimitError } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const o = body && typeof body === "object" ? (body as Record<string, unknown>) : {};
  const rawPhone = o.phone;
  const code = typeof o.code === "string" ? o.code : "";
  const region = resolvePhoneRegion(
    o.defaultCountry,
    req.headers.get("accept-language"),
    req.headers.get("x-vercel-ip-country"),
  );
  const phone = normalizePhone(
    typeof rawPhone === "string" ? rawPhone : "",
    region
  );

  if (!phone) {
    return NextResponse.json(
      { error: "Invalid phone number" },
      { status: 400 }
    );
  }

  if (!code || code.length < 4) {
    return NextResponse.json(
      { error: "Enter the code we sent you" },
      { status: 400 }
    );
  }

  const allowed = await rateLimit(`rl:verify:${phone}`, 5, 600);
  if (!allowed) {
    return NextResponse.json(rateLimitError(60), { status: 429 });
  }

  try {
    const valid = await checkVerification(phone, code);
    if (!valid) {
      return NextResponse.json({ error: "Wrong code" }, { status: 400 });
    }

    const token = crypto.randomUUID();
    await redis.set(`session:${token}`, phone, { ex: SESSION_TTL_SEC });

    return NextResponse.json({ token });
  } catch (e) {
    console.error("Verification check failed:", e);
    return NextResponse.json(
      { error: "Verification failed. Try again." },
      { status: 500 }
    );
  }
}

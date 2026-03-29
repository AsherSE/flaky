import { NextRequest, NextResponse } from "next/server";
import { normalizePhone, resolvePhoneRegion } from "@/lib/phone";
import { sendVerification } from "@/lib/twilio";
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
      { error: "Enter a valid phone number" },
      { status: 400 }
    );
  }

  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";

  const [phoneOk, ipOk] = await Promise.all([
    rateLimit(`rl:send:${phone}`, 3, 600),
    rateLimit(`rl:ip:send:${ip}`, 10, 3600),
  ]);
  if (!phoneOk || !ipOk) {
    return NextResponse.json(rateLimitError(60), { status: 429 });
  }

  try {
    await sendVerification(phone);
    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error("Failed to send verification:", e);
    return NextResponse.json(
      { error: "Failed to send code. Check the number and try again." },
      { status: 500 }
    );
  }
}

import { NextRequest, NextResponse } from "next/server";
import { normalizePhone } from "@/lib/phone";
import { checkVerification } from "@/lib/twilio";
import { redis } from "@/lib/redis";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const { phone: rawPhone, code } = await req.json();
  const phone = normalizePhone(rawPhone);

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

  try {
    const valid = await checkVerification(phone, code);
    if (!valid) {
      return NextResponse.json({ error: "Wrong code" }, { status: 400 });
    }

    const token = crypto.randomUUID();
    await redis.set(`session:${token}`, phone, { ex: 24 * 60 * 60 });

    return NextResponse.json({ token });
  } catch (e) {
    console.error("Verification check failed:", e);
    return NextResponse.json(
      { error: "Verification failed. Try again." },
      { status: 500 }
    );
  }
}

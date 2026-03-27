import { NextRequest, NextResponse } from "next/server";
import { normalizePhone, resolvePhoneRegion } from "@/lib/phone";
import { sendVerification } from "@/lib/twilio";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const body = await req.json();
  const rawPhone = body?.phone;
  const region = resolvePhoneRegion(
    body?.defaultCountry,
    req.headers.get("accept-language")
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

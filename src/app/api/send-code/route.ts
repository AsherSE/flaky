import { NextRequest, NextResponse } from "next/server";
import { normalizePhone } from "@/lib/phone";
import { sendVerification } from "@/lib/twilio";

export async function POST(req: NextRequest) {
  const { phone: rawPhone } = await req.json();
  const phone = normalizePhone(rawPhone);

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

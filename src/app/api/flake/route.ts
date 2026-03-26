import { NextRequest, NextResponse } from "next/server";
import { redis } from "@/lib/redis";
import { normalizePhone } from "@/lib/phone";
import { getRandomMessage } from "@/lib/messages";
import { sendSMS } from "@/lib/twilio";

const SEVEN_DAYS = 7 * 24 * 60 * 60;

export async function POST(req: NextRequest) {
  const authHeader = req.headers.get("authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const sessionToken = authHeader.slice(7);
  const myPhone = await redis.get<string>(`session:${sessionToken}`);
  if (!myPhone) {
    return NextResponse.json({ error: "Session expired" }, { status: 401 });
  }

  const { targetPhone: rawTarget, date } = await req.json();
  const targetPhone = normalizePhone(rawTarget);

  if (!targetPhone) {
    return NextResponse.json(
      { error: "Enter a valid phone number" },
      { status: 400 }
    );
  }

  if (targetPhone === myPhone) {
    return NextResponse.json(
      { error: "You can't flake on yourself (but we respect the honesty)" },
      { status: 400 }
    );
  }

  if (!date) {
    return NextResponse.json(
      { error: "Pick a day" },
      { status: 400 }
    );
  }

  // Canonical key: sorted phones so A->B and B->A share the same record
  const phones = [myPhone, targetPhone].sort();
  const flakeKey = `flake:${phones[0]}:${phones[1]}:${date}`;

  const existing = await redis.get<string[]>(flakeKey);

  // Already flaked — check if it became mutual since
  if (existing && existing.includes(myPhone)) {
    const isMutual = existing.includes(targetPhone);
    const message = getRandomMessage();
    return NextResponse.json({ mutual: isMutual, message });
  }

  // The other person already flaked — it's a match!
  if (existing && existing.includes(targetPhone)) {
    const message = getRandomMessage();

    await redis.set(flakeKey, [...existing, myPhone], { ex: SEVEN_DAYS });

    try {
      await sendSMS(
        targetPhone,
        `${message}\n\nYour plans for ${date} just got cancelled — and honestly, they wanted to cancel too. Guilt-free.\n\n— flaky`
      );
    } catch (e) {
      console.error("Failed to send notification SMS:", e);
    }

    return NextResponse.json({ mutual: true, message });
  }

  // First to flake — store it secretly
  await redis.set(flakeKey, [myPhone], { ex: SEVEN_DAYS });
  return NextResponse.json({ mutual: false, message: "" });
}

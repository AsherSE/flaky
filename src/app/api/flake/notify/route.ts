import { NextRequest, NextResponse } from "next/server";
import { sendSMS, twilioSendErrorInfo } from "@/lib/twilio";
import { getPlan } from "@/lib/plan";
import { inviteUrl } from "@/lib/invite";
import { sessionPhone } from "@/lib/auth";
import { consumeQuota, rateLimit, rateLimitError } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";

const DAY_SEC = 24 * 60 * 60;
const SEVEN_DAYS_SEC = 7 * DAY_SEC;

/**
 * Texts one person may send in a day, across every plan. A plan tops out at 10
 * people, so this is a handful of invites a day — far above real use, far below
 * anything that would get our Twilio number filtered.
 */
const SMS_PER_DAY = 30;

/** Sends per meeting. Two, so a failed send can be retried once, and no more. */
const SENDS_PER_MEETING = 2;

/**
 * POST — "Send individually": text each other participant their own invite via
 * Twilio. This is the explicit, manual alternative to dropping the invite into
 * a group chat from the result screen, so we never auto-text on pencil-in.
 */
export async function POST(req: NextRequest) {
  const myPhone = await sessionPhone(req);
  if (myPhone instanceof NextResponse) return myPhone;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const meetingId =
    body && typeof body === "object"
      ? (body as Record<string, unknown>).id
      : undefined;
  if (typeof meetingId !== "string" || !meetingId) {
    return NextResponse.json({ error: "Missing id" }, { status: 400 });
  }

  const meeting = await getPlan(meetingId);
  if (!meeting) {
    return NextResponse.json({ error: "Meeting not found" }, { status: 404 });
  }
  // Only a participant may text the others.
  if (!meeting.participants.includes(myPhone)) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const targets = meeting.participants.filter((p) => p !== myPhone);
  if (targets.length === 0) {
    return NextResponse.json({ sent: 0, smsFailures: undefined });
  }

  // Two gates, because they stop different things. The per-meeting one stops
  // the same people being texted again on every tap of "Send individually";
  // the daily budget stops many small plans adding up to a spam run.
  const meetingOk = await rateLimit(
    `rl:notify:${meetingId}`,
    SENDS_PER_MEETING,
    SEVEN_DAYS_SEC
  );
  if (!meetingOk) {
    return NextResponse.json(
      { error: "Everyone in this plan has already been texted." },
      { status: 429 }
    );
  }

  const budgetOk = await consumeQuota(
    `rl:sms:${myPhone}`,
    targets.length,
    SMS_PER_DAY,
    DAY_SEC
  );
  if (!budgetOk) {
    return NextResponse.json(
      {
        error:
          "You've sent a lot of invites today. Try again tomorrow, or share the link instead.",
        retryAfter: DAY_SEC,
      },
      { status: 429 }
    );
  }

  const smsBody = `flaky: ${meeting.creator} penciled you in for plans on ${meeting.date}. See plans: ${inviteUrl(meetingId)}\n\nReply STOP to opt out, HELP for help. Msg & data rates may apply.`;

  const smsResults = await Promise.all(
    targets.map(async (to) => {
      try {
        await sendSMS(to, smsBody);
        return { to, ok: true as const };
      } catch (e) {
        const info = twilioSendErrorInfo(e);
        console.error("Failed to send invitation SMS to", to, info);
        return {
          to,
          ok: false as const,
          code: info.code,
          message: info.message,
          moreInfo: info.moreInfo,
        };
      }
    })
  );

  const smsFailed = smsResults.filter((r) => !r.ok);
  if (smsFailed.length > 0) {
    console.error("SMS failures:", JSON.stringify(smsFailed));
  }

  return NextResponse.json({
    sent: smsResults.length - smsFailed.length,
    smsWarning:
      smsFailed.length > 0
        ? `Text couldn’t be sent to ${smsFailed.length} number${smsFailed.length > 1 ? "s" : ""}. They can still find the meeting when they open flaky.`
        : null,
    smsFailures:
      smsFailed.length > 0
        ? smsFailed.map((r) => ({
            to: r.to,
            code: r.code,
            message: r.message,
            moreInfo: r.moreInfo,
          }))
        : undefined,
  });
}

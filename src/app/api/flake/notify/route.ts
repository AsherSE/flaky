import { NextRequest, NextResponse } from "next/server";
import { redis } from "@/lib/redis";
import { sendSMS, twilioSendErrorInfo } from "@/lib/twilio";
import { getMeetingRecord } from "@/lib/meeting";

export const dynamic = "force-dynamic";

/**
 * POST — "Send individually": text each other participant their own invite via
 * Twilio. This is the explicit, manual alternative to dropping the invite into
 * a group chat from the result screen, so we never auto-text on pencil-in.
 */
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

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const meetingId =
    body && typeof body === "object"
      ? (body as Record<string, unknown>).meetingId
      : undefined;
  if (typeof meetingId !== "string" || !meetingId) {
    return NextResponse.json({ error: "Missing meetingId" }, { status: 400 });
  }

  const meeting = await getMeetingRecord(meetingId);
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

  const smsBody = `flaky: ${meeting.creator} penciled you in for plans on ${meeting.date}. See plans: https://flaky.me/m/${meetingId}\n\nReply STOP to opt out, HELP for help. Msg & data rates may apply.`;

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

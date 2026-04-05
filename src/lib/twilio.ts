import twilio from "twilio";

/** Parse Twilio REST errors from the Node SDK for logs and UI hints. */
export function twilioSendErrorInfo(e: unknown): {
  message: string;
  code?: number;
  moreInfo?: string;
} {
  if (e && typeof e === "object") {
    const o = e as Record<string, unknown>;
    const message =
      typeof o.message === "string" && o.message.trim()
        ? o.message
        : e instanceof Error
          ? e.message
          : String(e);
    const code = typeof o.code === "number" ? o.code : undefined;
    const moreInfo =
      typeof o.moreInfo === "string" ? o.moreInfo : undefined;
    return { message, code, moreInfo };
  }
  return { message: String(e) };
}

const accountSid = process.env.TWILIO_ACCOUNT_SID!;
const authToken = process.env.TWILIO_AUTH_TOKEN!;
const verifyServiceSid = process.env.TWILIO_VERIFY_SERVICE_SID!;
const fromNumber = process.env.TWILIO_PHONE_NUMBER!;

const client = twilio(accountSid, authToken);

export async function sendVerification(to: string) {
  return client.verify.v2
    .services(verifyServiceSid)
    .verifications.create({ to, channel: "sms" });
}

export async function checkVerification(
  to: string,
  code: string
): Promise<boolean> {
  const check = await client.verify.v2
    .services(verifyServiceSid)
    .verificationChecks.create({ to, code });
  return check.status === "approved";
}

export async function sendSMS(to: string, body: string) {
  return client.messages.create({ to, from: fromNumber, body });
}

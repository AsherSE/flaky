import twilio from "twilio";

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

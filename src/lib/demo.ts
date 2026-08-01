/**
 * App Review demo accounts.
 *
 * Signing in normally needs a Twilio SMS code, which App Review can't reliably
 * receive — "we were unable to sign in" is one of the most common rejections.
 * These numbers skip Twilio and accept one fixed code instead, and we never
 * text them, so a reviewer can walk the whole flow (two accounts, both flaking,
 * mutual cancel) without a single real SMS going out.
 *
 * Off unless BOTH env vars are set. FLAKY_DEMO_CODE is a standing credential —
 * make it long and random, and rotate it after review.
 *
 *   FLAKY_DEMO_PHONES=+12025550143,+13105550123
 *   FLAKY_DEMO_CODE=<long random string>
 *
 * Numbers must be ones normalizePhone() accepts, or sign-in 400s before it ever
 * reaches the demo check. libphonenumber-js/max is strict: +15551234567 and the
 * UK +447700900xxx drama range are both rejected. The NANP 555-01xx range
 * (reserved for fiction) does validate — hence the examples above.
 */

function parsePhones(): Set<string> {
  return new Set(
    (process.env.FLAKY_DEMO_PHONES ?? "")
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean)
  );
}

export function demoEnabled(): boolean {
  return parsePhones().size > 0 && (process.env.FLAKY_DEMO_CODE?.trim() ?? "").length > 0;
}

/** True if this number is a review account — skip Twilio for it, both ways. */
export function isDemoPhone(phoneE164: string): boolean {
  return demoEnabled() && parsePhones().has(phoneE164);
}

export function demoCodeMatches(code: string): boolean {
  const expected = process.env.FLAKY_DEMO_CODE?.trim() ?? "";
  return demoEnabled() && expected.length > 0 && code === expected;
}

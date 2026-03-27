export const PROFILE_TTL_SEC = 365 * 24 * 60 * 60;

export function profileKey(phoneE164: string) {
  return `profile:${phoneE164}`;
}

/**
 * From a full name (e.g. browser autofill "Jane Doe"), derive stored label "Jane D."
 * Single word → kept as-is (max length). Empty / invalid → null.
 */
export function profileNameFromInput(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const t = raw.trim().replace(/\s+/g, " ");
  if (!t) return null;

  const parts = t.split(" ");
  let out: string;
  if (parts.length === 1) {
    out = parts[0]!;
  } else {
    const first = parts[0]!;
    const last = parts[parts.length - 1]!;
    const initial = last.charAt(0).toLocaleUpperCase();
    out = initial ? `${first} ${initial}.` : first;
  }

  return out.slice(0, 60);
}

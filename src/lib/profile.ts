export const PROFILE_TTL_SEC = 365 * 24 * 60 * 60;

export function profileKey(phoneE164: string) {
  return `profile:${phoneE164}`;
}

/** Single-line display name; returns null if empty after trim. */
export function sanitizeFirstName(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const t = raw.trim().replace(/\s+/g, " ");
  if (!t) return null;
  return t.slice(0, 60);
}

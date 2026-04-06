const STORAGE_KEY = "flaky-contact-book-names";

export function loadContactBookNames(): Record<string, string> {
  if (typeof window === "undefined") return {};
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    const o = JSON.parse(raw) as unknown;
    if (!o || typeof o !== "object" || Array.isArray(o)) return {};
    const out: Record<string, string> = {};
    for (const [k, v] of Object.entries(o as Record<string, unknown>)) {
      if (typeof v === "string" && v.trim()) out[k] = v.trim();
    }
    return out;
  } catch {
    return {};
  }
}

export function persistContactBookNames(names: Record<string, string>): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(names));
  } catch {
    /* quota or private mode */
  }
}

export function withContactBookName(
  e164: string,
  displayName: string,
  prev: Record<string, string>
): Record<string, string> {
  const name = displayName.trim();
  if (!name) return prev;
  const next = { ...prev, [e164]: name };
  persistContactBookNames(next);
  return next;
}

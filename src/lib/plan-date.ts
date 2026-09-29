/**
 * First usable locale from an Accept-Language header, so a server-rendered
 * date reads "Tuesday 6 October" in London and "Tuesday, October 6" in LA.
 */
export function localeFromAcceptLanguage(header: string | null): string {
  for (const part of (header ?? "").split(",")) {
    const tag = part.split(";")[0]?.trim();
    if (!tag || tag === "*") continue;
    try {
      return new Intl.Locale(tag).toString();
    } catch {
      /* invalid tag */
    }
  }
  return "en-US";
}

/** "YYYY-MM-DD" → "Tuesday, October 6" in `locale`, without timezone drift. */
export function formatPlanDateForLocale(ymd: string, locale: string): string {
  const [y, m, d] = ymd.split("-").map(Number);
  if (!y || !m || !d) return ymd;
  const opts: Intl.DateTimeFormatOptions = {
    weekday: "long",
    month: "long",
    day: "numeric",
    timeZone: "UTC",
  };
  const at = new Date(Date.UTC(y, m - 1, d));
  try {
    return at.toLocaleDateString(locale, opts);
  } catch {
    return at.toLocaleDateString("en-US", opts);
  }
}

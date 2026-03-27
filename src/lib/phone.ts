import {
  parsePhoneNumberFromString,
  getCountries,
  type CountryCode,
} from "libphonenumber-js/max";

export type { CountryCode };

const KNOWN = new Set<string>(getCountries());

export function isKnownCountryCode(
  region: string | null | undefined
): region is CountryCode {
  if (!region || region.length !== 2) return false;
  return KNOWN.has(region.toUpperCase());
}

/** Prefer explicit client hint; else region from Accept-Language; else fallback (US). */
export function resolvePhoneRegion(
  fromBody: unknown,
  acceptLanguage: string | null,
  fallback: CountryCode = "US"
): CountryCode {
  if (typeof fromBody === "string" && isKnownCountryCode(fromBody)) {
    return fromBody.toUpperCase() as CountryCode;
  }
  const fromLang = regionFromAcceptLanguage(acceptLanguage);
  if (fromLang) return fromLang;
  return fallback;
}

function regionFromAcceptLanguage(header: string | null): CountryCode | undefined {
  if (!header) return undefined;
  for (const part of header.split(",")) {
    const tag = part.split(";")[0]?.trim();
    if (!tag) continue;
    try {
      const region = new Intl.Locale(tag).region;
      if (isKnownCountryCode(region)) return region.toUpperCase() as CountryCode;
    } catch {
      /* invalid locale tag */
    }
  }
  return undefined;
}

/**
 * Normalize to E.164. Numbers with + or 00… are parsed as international.
 * Otherwise parsed as a national number in `defaultCountry` (browser locale or API hint).
 */
export function normalizePhone(
  raw: string,
  defaultCountry: CountryCode = "US"
): string | null {
  if (!raw?.trim()) return null;

  const trimmed = raw.trim().replace(/^00+(?=\d)/, "+");

  if (trimmed.startsWith("+")) {
    const intl = parsePhoneNumberFromString(trimmed);
    if (intl?.isValid()) return intl.format("E.164");
    return null;
  }

  const national = parsePhoneNumberFromString(trimmed, defaultCountry);
  if (national?.isValid()) return national.format("E.164");

  // Preserve previous US-only behavior if libphonenumber is stricter on an edge case.
  if (defaultCountry === "US") {
    const cleaned = raw.replace(/[^\d+]/g, "");
    const digits = cleaned.replace(/\D/g, "");
    if (digits.length === 10) return `+1${digits}`;
    if (digits.length === 11 && digits.startsWith("1")) return `+${digits}`;
  }

  return null;
}

/** Best-effort region from the browser (for national numbers without a country prefix). */
export function inferPhoneRegionFromNavigator(): CountryCode {
  if (typeof navigator === "undefined" || typeof Intl === "undefined") return "US";

  const fromTag = (tag: string | undefined): CountryCode | null => {
    if (!tag) return null;
    try {
      const region = new Intl.Locale(tag).region;
      if (isKnownCountryCode(region)) return region.toUpperCase() as CountryCode;
    } catch {
      /* ignore */
    }
    return null;
  };

  for (const lang of navigator.languages ?? []) {
    const r = fromTag(lang);
    if (r) return r;
  }
  return fromTag(navigator.language) ?? "US";
}

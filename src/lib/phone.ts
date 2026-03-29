import {
  parsePhoneNumberFromString,
  getCountries,
  getCountryCallingCode,
  type CountryCode,
} from "libphonenumber-js/max";

export type { CountryCode };

const KNOWN = new Set<string>(getCountries());

function flagEmoji(cc: CountryCode): string {
  const upper = cc.toUpperCase();
  return String.fromCodePoint(
    0x1f1e6 + upper.charCodeAt(0) - 65,
    0x1f1e6 + upper.charCodeAt(1) - 65,
  );
}

const DISPLAY_NAME_CACHE = new Map<string, string>();
function regionDisplayName(cc: CountryCode, locale = "en"): string {
  const key = `${cc}:${locale}`;
  if (DISPLAY_NAME_CACHE.has(key)) return DISPLAY_NAME_CACHE.get(key)!;
  try {
    const name = new Intl.DisplayNames([locale], { type: "region" }).of(cc) ?? cc;
    DISPLAY_NAME_CACHE.set(key, name);
    return name;
  } catch {
    return cc;
  }
}

const PRIORITY_REGIONS: CountryCode[] = [
  "US", "GB", "CA", "AU", "IN", "DE", "FR", "JP", "BR", "MX",
  "ES", "IT", "NL", "SE", "IL", "KR", "NZ", "IE", "SG", "ZA",
];

export interface RegionOption {
  code: CountryCode;
  callingCode: string;
  flag: string;
  name: string;
}

let _regionOptions: RegionOption[] | null = null;

export function getRegionOptions(): RegionOption[] {
  if (_regionOptions) return _regionOptions;
  const all = getCountries();
  const opts: RegionOption[] = all.map((c) => ({
    code: c,
    callingCode: getCountryCallingCode(c),
    flag: flagEmoji(c),
    name: regionDisplayName(c),
  }));
  opts.sort((a, b) => a.name.localeCompare(b.name));
  const prioritySet = new Set<CountryCode>(PRIORITY_REGIONS);
  const top = PRIORITY_REGIONS.map((c) => opts.find((o) => o.code === c)!).filter(Boolean);
  const rest = opts.filter((o) => !prioritySet.has(o.code));
  _regionOptions = [...top, ...rest];
  return _regionOptions;
}

export function callingCodeForRegion(cc: CountryCode): string {
  return getCountryCallingCode(cc);
}

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

/** Strip `tel:` and light cleanup; keeps `+` and digits for parsing. */
function preprocessPhoneRaw(raw: string): string {
  let s = raw.trim();
  if (/^tel:/i.test(s)) {
    s = s.replace(/^tel:/i, "").trim();
  }
  s = s.replace(/^00+(?=\d)/, "+");
  return s;
}

/**
 * Normalize to E.164. Numbers with + or 00… are parsed as international.
 * Otherwise parsed as a national number in `defaultCountry` (browser locale or API hint).
 * Explicit `+country…` is never double-prefixed; national numbers use `defaultCountry`.
 */
export function normalizePhone(
  raw: string,
  defaultCountry: CountryCode = "US"
): string | null {
  if (!raw?.trim()) return null;

  const trimmed = preprocessPhoneRaw(raw);

  if (trimmed.startsWith("+")) {
    const intl = parsePhoneNumberFromString(trimmed);
    if (intl?.isValid()) return intl.format("E.164");
    return null;
  }

  const national = parsePhoneNumberFromString(trimmed, defaultCountry);
  if (national?.isValid()) return national.format("E.164");

  // National digits-only fallback when libphonenumber is stricter (e.g. unusual separators).
  if (defaultCountry === "US") {
    const digits = trimmed.replace(/\D/g, "");
    if (digits.length === 10) return `+1${digits}`;
    if (digits.length === 11 && digits.startsWith("1")) return `+${digits}`;
  }

  return null;
}

/** Shown when the meeting field contains the signed-in user's number (strict or loose match). */
export const FLAKE_TARGET_OWN_NUMBER_MSG = "Enter someone else's number.";

const MIN_LOOSE_MATCH_LEN = 10;

/** True when `raw` is probably the same handset as `selfE164`, even if `normalizePhone(raw)` failed. */
function rawLooksLikeOwnNumber(
  raw: string,
  selfE164: string,
  defaultCountry: CountryCode
): boolean {
  const a = raw.replace(/\D/g, "");
  const b = selfE164.replace(/\D/g, "");
  if (!a || !b) return false;
  if (a === b) return true;

  const shorter = a.length <= b.length ? a : b;
  const longer = a.length <= b.length ? b : a;
  if (shorter.length >= MIN_LOOSE_MATCH_LEN && longer.endsWith(shorter)) {
    return true;
  }

  if (defaultCountry === "US" || defaultCountry === "CA") {
    const stripLeadingOne = (d: string) =>
      d.length === 11 && d.startsWith("1") ? d.slice(1) : d;
    const an = stripLeadingOne(a);
    const bn = stripLeadingOne(b);
    if (
      an.length >= MIN_LOOSE_MATCH_LEN &&
      bn.length >= MIN_LOOSE_MATCH_LEN &&
      an === bn
    ) {
      return true;
    }
    if (an.length === 10 && bn.endsWith(an)) return true;
    if (bn.length === 10 && an.endsWith(bn)) return true;
  }

  return false;
}

export type FlakeTargetAnalysis =
  | { ok: true; targetsE164: string[] }
  | { ok: false; error: string };

/**
 * Validates flake "who are you meeting" inputs. Uses `selfE164` so own number is rejected
 * even when the API would otherwise see zero valid parses.
 */
export function analyzeFlakeTargetInput(
  rawSlots: string[],
  defaultCountry: CountryCode,
  selfE164: string | null
): FlakeTargetAnalysis {
  const nonEmpty = rawSlots
    .map((s) => (typeof s === "string" ? s.trim() : ""))
    .filter(Boolean);

  if (nonEmpty.length === 0) {
    return { ok: false, error: "Invalid request" };
  }

  const pairs = nonEmpty.map((raw) => ({
    raw,
    e164: normalizePhone(raw, defaultCountry),
  }));

  for (const p of pairs) {
    if (p.e164 && selfE164 && p.e164 === selfE164) {
      return { ok: false, error: FLAKE_TARGET_OWN_NUMBER_MSG };
    }
  }

  if (selfE164) {
    for (const p of pairs) {
      if (!p.e164 && rawLooksLikeOwnNumber(p.raw, selfE164, defaultCountry)) {
        return { ok: false, error: FLAKE_TARGET_OWN_NUMBER_MSG };
      }
    }
  }

  const invalid = pairs.filter((p) => !p.e164);
  if (invalid.length > 0) {
    if (pairs.length === 1) {
      return { ok: false, error: "Enter a valid number." };
    }
    return {
      ok: false,
      error: "Some entries aren't valid numbers — check each one.",
    };
  }

  const unique = Array.from(new Set(pairs.map((p) => p.e164!)));
  return { ok: true, targetsE164: unique };
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

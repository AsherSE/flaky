export function normalizePhone(raw: string): string | null {
  if (!raw) return null;

  const cleaned = raw.replace(/[^\d+]/g, "");

  if (cleaned.startsWith("+") && cleaned.length >= 11) {
    return cleaned;
  }

  const digits = cleaned.replace(/\D/g, "");

  if (digits.length === 10) {
    return `+1${digits}`;
  }

  if (digits.length === 11 && digits.startsWith("1")) {
    return `+${digits}`;
  }

  if (digits.length >= 11) {
    return `+${digits}`;
  }

  return null;
}

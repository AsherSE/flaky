import { Capacitor, registerPlugin } from "@capacitor/core";

export interface ContactPickResult {
  phone: string;
  displayName: string;
}

interface ContactPickerPlugin {
  pickPhone(): Promise<{ phone: string; displayName: string }>;
}

const ContactPicker = registerPlugin<ContactPickerPlugin>("ContactPicker");

/**
 * Opens the native contact picker (contact-first). Single phone is returned
 * immediately; multiple numbers show a native chooser.
 * Returns null when not native, on cancel, or when no usable number.
 */
export async function pickPhoneFromContacts(): Promise<ContactPickResult | null> {
  try {
    const result = await ContactPicker.pickPhone();
    const phone = typeof result.phone === "string" ? result.phone.trim() : "";
    const displayName =
      typeof result.displayName === "string" ? result.displayName.trim() : "";
    if (!phone) return null;
    return { phone, displayName };
  } catch {
    return null;
  }
}

/** True when running inside a Capacitor native shell (iOS/Android). */
export function isNativeApp(): boolean {
  try {
    return Capacitor.isNativePlatform();
  } catch {
    return false;
  }
}

/** True only in the Capacitor iOS app (not Safari, not Android). */
export function isCapacitorIOS(): boolean {
  try {
    return Capacitor.isNativePlatform() && Capacitor.getPlatform() === "ios";
  } catch {
    return false;
  }
}

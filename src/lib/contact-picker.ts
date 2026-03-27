import { Capacitor, registerPlugin } from "@capacitor/core";

interface ContactPickerPlugin {
  pickPhone(): Promise<{ phone: string }>;
}

const ContactPicker = registerPlugin<ContactPickerPlugin>("ContactPicker");

/**
 * Opens the native iOS contact picker and returns the selected phone number.
 * Returns null when running in a plain browser (non-Capacitor) or if the user cancels.
 */
export async function pickPhoneFromContacts(): Promise<string | null> {
  try {
    const result = await ContactPicker.pickPhone();
    return result.phone || null;
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

import { Capacitor, registerPlugin } from "@capacitor/core";

interface SharedSessionPlugin {
  set(options: { token: string | null }): Promise<void>;
}

const SharedSession = registerPlugin<SharedSessionPlugin>("SharedSession");

/**
 * Mirror the session token into the iOS shared keychain so the iMessage
 * extension can pencil in plans as you. A no-op off the native iOS shell.
 */
export async function syncNativeSession(token: string | null): Promise<void> {
  try {
    if (!Capacitor.isNativePlatform() || Capacitor.getPlatform() !== "ios") {
      return;
    }
    await SharedSession.set({ token });
  } catch {
    /* older app build without the plugin — the extension just asks to sign in */
  }
}

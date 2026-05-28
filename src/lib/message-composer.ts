import { Capacitor, registerPlugin } from "@capacitor/core";

export type ComposeResult = "sent" | "cancelled" | "failed" | "unavailable";

interface MessageComposerPlugin {
  canSend(): Promise<{ available: boolean }>;
  compose(options: {
    body: string;
    recipients: string[];
  }): Promise<{ result: ComposeResult }>;
}

const MessageComposer =
  registerPlugin<MessageComposerPlugin>("MessageComposer");

/** True only on a native iOS shell that can present the Messages composer. */
export function canComposeMessage(): boolean {
  try {
    return (
      Capacitor.isNativePlatform() && Capacitor.getPlatform() === "ios"
    );
  } catch {
    return false;
  }
}

/**
 * Opens the native Messages sheet pre-filled with `body` and `recipients`.
 * Pre-filling the exact recipient set lets iMessage drop the message into the
 * user's existing group thread. Returns the outcome, or "unavailable" when not
 * on a capable native shell.
 */
export async function composeGroupInvite(options: {
  body: string;
  recipients: string[];
}): Promise<ComposeResult> {
  if (!canComposeMessage()) return "unavailable";
  try {
    const { result } = await MessageComposer.compose({
      body: options.body,
      recipients: options.recipients,
    });
    return result;
  } catch {
    return "failed";
  }
}

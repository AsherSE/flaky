# Button

Full-width, rounded-xl buttons that carry every step forward; one `primary` per step.

- **primary** (`terracotta`, white text): the step's single forward action. "Send code", "Verify", "Pencil in", "Send to group", "Open flaky".
- **oat** (`surface-bottom` fill, `ink` text): secondary actions stacked under a primary. "Copy link" → "Copied!", "Send individually".
- **confirm** (`sage`): closes a result screen. "Done", or "Nice" after a mutual cancel.
- **outline** (`line-control` border, `ink-2`): the non-destructive half of a pair ("Cancel", "Keep my account").
- **danger** (`danger`): only for account deletion. Never for flaking; flaking is not destructive.
- **quiet**: text-only, `muted`, for "Resend code" / "Use a different number".

Full size (py-3, text-base) is the default; the compact size (text-sm, py-2.5) is for two buttons side by side in the profile panel.
Loading state swaps the label for "..." or a gerund ("Sending...", "Verifying...") and sets `disabled` (opacity .5).

**Contrast:** white on `terracotta` is 2.95:1 and white on `sage` is 2.4:1, below WCAG AA. They are kept exact from the app; consider darkening to `terracotta-active` / `sage-ink` fills if accessibility matters more than the current warmth.

_Implemented inline in `src/app/page.tsx`._

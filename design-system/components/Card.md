# Card

The single white card that holds each step of the flow, centred in a 384px column on the warm page gradient.

- `card` fill, 1px `line-card`, `radius-2xl`, `shadow-card`, padding `space-6`, children spaced `space-4`.
- One card per screen. The wordmark sits above it and the calendar and plan list sit below it, on the gradient, never in their own cards.
- Put the page on the `surface-top` → `surface-bottom` gradient (`bg-gradient-to-b from-surface-top to-surface-bottom`) with a `space-4` side gutter.

_Implemented inline in `src/app/page.tsx`._

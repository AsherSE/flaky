# CancelPie

A tiny conic pie showing who wants out: one slice per person, their pastel if they flaked, `ink` if they're still on.

- Each person's pastel comes from `slice-00-sakura`…`slice-15-nadeshiko`, picked by fnv1a32(E.164) % 16, so someone is the same colour on every plan.
- You are always the first slice (12 o'clock, clockwise), everyone else sorted.
- Diameter `pie` (≈29px), hairline `line-pie`, `shadow-pie` highlight.
- It never reveals names; it's a mood ring, not a leaderboard. The aria-label gives the count.

_Implemented inline in `src/app/page.tsx`._

# FlakePill

The lowercase pill at the end of a plan row: `flake` to secretly opt out, `recommit` to take it back.

- `flake`: `terracotta-line` border, `terracotta-hover` text; hover washes `terracotta-tint`.
- `recommit`: the sage twin (`sage-line`, `sage-ink`).
- Always lowercase, one word. The aria-label spells out the secret: "Flake — secretly want to cancel this plan".
- Hide it once a plan is mutual. There is nothing left to decide.
- Min width 4.25rem so the two words don't shift the row when they swap.

_Implemented inline in `src/app/page.tsx`._

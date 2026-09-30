# Calendar

A Sunday-first month grid that only lights up days with plans; tap one to filter the list below.

- Days with plans: white (`card`) cells with a 4px `terracotta` dot; hover `terracotta-tint`.
- Selected day: solid `terracotta`, bold white number, white dot.
- Today: a 1px inset ring of `terracotta` at 40%.
- Empty in-month days `day-idle`, spill-over days `day-outside`; neither is tappable.
- Month nav chevrons disable (opacity .3) past the first and last month that has plans.
- Sits directly on the page gradient, not inside the card.

_Implemented inline in `src/app/page.tsx`._

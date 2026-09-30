# PlanRow

One upcoming plan in the list under the calendar: a plan badge, a status line, who's in, an invite link, and the flake/recommit pill.

- **Badge:** a 36px round `PlanBadge` showing the plan's time-of-day icon (morning / lunch / night), or a plain calendar icon when none was picked. `line-card` border on `card`; sage tint once the plan is mutual.
- **Status copy is fixed, and never reveals anyone else:** "Penciled in", "You want out — your secret's safe", and when mutual "Everyone wanted out — you're covered" in `sage-ink`. No counts, ever.
- **People line:** "With · Maya · …0102 · …0103". Names come from saved profiles, then the phone's contacts, else a masked number. Never show a full number.
- **"Invite more people"** sits under the people line (`caption`, underlined) until the plan is mutual. It opens the group composer on iOS, the share sheet on the web, or copies the link.
- Status and people use `caption` in `muted` / `ink-3`.
- Rows are separated by `space-5`, no dividers.
- Group rows under a `PlanDayHeader` ("Mon, Sep 28, 2026", `day-header` in `muted`) for the day selected in the calendar.

_Implemented inline in `src/app/page.tsx`._

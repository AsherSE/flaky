# PlanRow

One upcoming plan in the list under the calendar: pie, a status line, who's in, and the flake/recommit pill.

- Status copy is fixed: "Meeting penciled in", "You want to cancel", "You and 2 more want to cancel", "2 of 4 want to cancel", and when mutual "Everyone wanted out — you're covered" in `sage-ink`.
- People line: "With · Maya · …0102 · …0103". Names come from saved profiles, then the phone's contacts, else a masked number. Never show a full number.
- Status and people use `caption` in `muted` / `ink-3`; the optional time-of-day icon sits before the status at 14px in `faint`.
- Rows are separated by `space-5`, no dividers.
- Group rows under a `PlanDayHeader` ("Mon, Sep 28, 2026", `day-header` in `muted`) for the day selected in the calendar.

_Implemented inline in `src/app/page.tsx`._

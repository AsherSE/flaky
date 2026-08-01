# TODO

## Reframe as an appointment-booking app, driven by SMS reminders

Today flaky is pull-based: you only flake if you happen to open the app and tap
the button. That asks people to remember an app exists at the exact moment they
are trying to avoid thinking about the plan at all.

Push-based instead. A plan becomes an appointment, and flaky reaches out:

- **The day before** and **the day of**, text everyone in the plan.
- Replying **`9`** flakes you out — same secrecy rule as now, nobody learns
  anything unless everyone else replies `9` too.
- If everyone flakes, the plan is cancelled and everyone is told, guilt-free.
- Otherwise the reply is swallowed and the plan stands.

The point is that the reminder arrives exactly when someone is deciding whether
they can face it, and bailing costs one character. No app to open.

### Reschedule as the alternative

Rather than only offering "cancel", let the app propose a new time. Cancelling
is a dead end; rescheduling keeps the plan alive, which is usually what both
people actually wanted. Worth deciding whether reschedule is a separate reply
keyword, or something flaky offers automatically once everyone has flaked.

### Things to work out first

- **Inbound SMS.** We only send today. This needs a Twilio webhook, and a way
  to map an inbound number + `9` back to a specific plan — a person can have
  several plans live at once, so "which one is this reply about?" is the crux.
  The day-before/day-of window narrows it but doesn't fully resolve it.
- **Scheduling.** Reminders need a cron or queue. Vercel Cron runs in UTC and
  plans are per-calendar-day, so the existing `FLAKY_PLAN_DATE_TZ` handling
  needs revisiting — a "day before" reminder is meaningless without knowing the
  user's timezone.
- **Message volume.** Two extra texts per plan per person is a real jump in
  Twilio cost and in how spammy this feels. Push notifications may be the
  better carrier for app users, with SMS as the fallback for people who
  haven't installed it.
- **Consent.** More automated outbound messaging raises the bar on opt-in and
  on STOP handling. Check this against Twilio's campaign registration before
  building.

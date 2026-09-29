# TODO

Roadmap after the first App Store submission. The order matters: the data model
change unblocks almost everything else, so it comes first even though it is the
least visible.

## 1. ~~Give a plan an identity of its own~~ — done

Plans are now `plan:{id}` records with growable participant sets (see
`src/lib/plan.ts`), and invite links (`/m/<id>`) let anyone join. Old-shape
keys are migrated lazily by `src/lib/legacy-plans.ts`; every legacy key has
expired by 2026-10-08, so delete that file and its two call sites after then.

Reschedule (below) is now just a field write on `plan:{id}`.

## 2. Push notifications instead of SMS, where possible

SMS is the expensive, fragile, carrier-policed way to reach someone who has
already installed the app. Push is free and instant.

Keep SMS for people who have not installed flaky yet — that is genuinely the
only way to reach them, and it is what the invite flow is for. But once someone
has the app, everything after that should be a push.

This also settles the App Store risk. Guideline 4.2 is about whether the app
does something a website cannot, and push notifications are the clearest
possible answer. See the note in `APP_STORE.md`.

## 3. Reminder-driven flaking

Once 1 and 2 are done, the idea that started this list becomes buildable.

Today flaky is pull-based: you flake only if you happen to open the app at the
moment you are dreading the plan. Push-based inverts it.

- **The day before** and **the day of**, notify everyone in the plan.
- Replying **`9`** (or tapping through from a push) flakes you out, with the
  same secrecy rule — nobody learns anything unless everyone else does too.
- If everyone flakes, the plan is cancelled and everyone is told, guilt-free.
- Otherwise the reply is swallowed and the plan stands.

The reminder arrives exactly when someone is deciding whether they can face it,
and bailing costs one character.

### The inbound problem, and why 1 helps

Inbound SMS has no context: a `9` arrives from a number, and we have to work out
which plan it means. A person can have several live at once.

With reminders this is tractable — write `lastReminded:{phone} -> meetingId`
when the reminder goes out, with a TTL covering the window in which a reply is
plausible. A bare `9` then resolves to the plan we most recently reminded them
about, which is almost always the one they mean. Anything ambiguous gets a reply
asking them to open the app.

Also worth checking against Twilio's campaign rules before building: more
automated outbound raises the bar on opt-in and STOP handling.

### Reschedule as the alternative

Cancelling is a dead end; rescheduling keeps the plan alive, which is usually
what both people actually wanted. Worth deciding whether it is a separate reply
keyword, or something flaky offers automatically once everyone has flaked.

## 4. Tests

There are none. The two places that most need them:

- **`deleteAccount`** — irreversible, and it has to purge four key types. It was
  verified by hand against production, which is not repeatable.
- **The meeting model** — whatever replaces the flake key. Round-tripping and
  rejecting malformed input is exactly the kind of logic that rots silently.

## 5. Operational

- **Move off free-tier Upstash.** The database was reclaimed for inactivity and
  the site served 500s to real users for weeks before anyone noticed. That will
  happen again during a quiet spell.
- **Add a health endpoint that actually pings Redis**, and point an uptime check
  at it. When Redis died, every route returned an empty 500 and the only way to
  tell a dead database from bad credentials was to time the responses.
- **Watch Twilio spend** during the beta. The 30-per-day budget is per sender.

## Smaller things

- The legacy string-array branch in `getFlakeMembers` is almost certainly dead —
  sets have been the format for a while and plans expire after 7 days.
- Content scrolls under the status bar with nothing behind it (`viewportFit:
  "cover"` with no safe-area treatment). It made two App Store screenshots look
  broken.
- `next.config.mjs` disables the webpack dev cache to dodge a bug that may well
  be fixed by now.

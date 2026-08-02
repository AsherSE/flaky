# TODO

Roadmap after the first App Store submission. The order matters: the data model
change unblocks almost everything else, so it comes first even though it is the
least visible.

## 1. Give a plan an identity of its own

Today a plan *is* its participants and date, spelled out in the Redis key:

```
flake:+15551230000:+15554560000:2026-08-15
```

Everything awkward about the app traces back to that one decision.

- **You cannot add anyone to an existing plan.** A different participant set is
  a different key, so "add Sam" silently means "make a second, unrelated plan".
- **You cannot reschedule.** Changing the date changes the identity, which is
  why the reschedule idea below has nowhere to live right now.
- **You cannot remove one person's data without destroying the plan.** This came
  up building account deletion: participant numbers are baked into the key, so
  there is no way to strip someone out without rewriting it. Deleting your
  account currently deletes the plans you were in, for everyone in them. That is
  defensible but it is not what anyone would choose.
- **Phone numbers are smeared across key names**, so purging personal data means
  finding keys by their name rather than reading a record.
- `meeting:{id}` records were added later for invite links, so the same plan is
  now described in two places that can disagree.

### The shape to move to

One record, keyed by an opaque id, and one index per user pointing at it:

```
meeting:{id}          { id, date, timeOfDay, createdBy, createdAt,
                        participants: [...E.164], flaked: [...E.164] }
userMeetings:{phone}  set of meeting ids
```

Two key types instead of the current five (`flake:`, `flakeMeta:`,
`userFlakes:`, `meeting:`, `userMeetings:`). Then:

- **Adding someone** appends to `participants` and adds the id to their index.
  The plan keeps its identity, and the invite link keeps working.
- **Rescheduling** is a field write.
- **Account deletion** removes you from `participants` and `flaked`, and only
  deletes the meeting when it drops below two people. Other people keep their
  plans.
- **Nothing personal appears in a key name.**
- **Invite links stop being a parallel structure** and become the primary way a
  plan is addressed, which is what they already are in the UI.

### Migration is nearly free

Plans expire after 7 days. Ship the new model, keep reading the old keys for a
week, then delete that code. No backfill, no dual-write window beyond the TTL.
This is the one moment where the short TTL is an asset — worth using it before
the app has enough users to make a migration painful.

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

# App Store submission

Working notes for submitting flaky to the App Store. Keep this updated — most of
it is reusable for every release, not just the first.

## App Review notes

Paste into **App Store Connect → your build → App Review Information → Notes**.
The credentials below are the live ones — update them here if you rotate
`FLAKY_DEMO_CODE` or change `FLAKY_DEMO_PHONES`.

> flaky helps friends call off plans without anyone having to be the one who
> backs out. You pencil in a plan with someone; either side can then privately
> flag that they'd rather not go. Nothing is revealed unless *everyone* flags
> it — at which point both sides are told the plan is off. If only one person
> flags, it stays secret and the plan stands.
>
> DEMO ACCOUNTS
> Signing in normally requires an SMS code. These two review accounts skip SMS
> entirely and accept a fixed code instead, so no phone is needed:
>
>   Account 1: +1 202 555 0143
>   Account 2: +1 310 555 0123
>   Code for both: 432735
>
> Enter the number on the first screen, continue, then enter the code above. No
> real SMS is sent to or from these numbers.
>
> HOW TO SEE THE CORE FEATURE
> 1. Sign in as +1 202 555 0143. A display name is optional — you can skip it.
> 2. Under "Who are you meeting?", enter +1 310 555 0123, pick a date (today or
>    later) and a time of day, then tap "Pencil in". The next screen offers
>    "Send to group", "Copy link" and "Send individually" — inviting is an
>    explicit choice, never automatic. You can skip all three and tap "Done";
>    the plan already exists for both people.
> 3. In the calendar below the form, tap that date — the plan appears with a
>    "flake" button. Tap it. You'll see "Secret's safe": the other person has
>    NOT been told, which is the whole point of the app. Tap "Done". The button
>    on the plan now reads "recommit", which takes the flag back.
> 4. Open the profile panel by tapping "Signed in as ..." at the top, then "Use
>    a different number". Sign in as +1 310 555 0123 with the same code.
> 5. Tap the same date in the calendar, then "flake" again. Both sides have now
>    flagged, so you'll see "It's mutual!" — the plan is cancelled and both
>    people are notified.
>
> ACCOUNT DELETION
> Tap "Signed in as ..." at the top of the signed-in screen, then "Delete my
> account". This permanently removes the account, display name, all sessions,
> and all plans.
>
> ABOUT THE SMS
> The app sends transactional SMS through Twilio only: the verification code at
> sign-in, an invite the user explicitly chooses to send ("Send individually"),
> and a confirmation when everyone in a plan has agreed to cancel. Invites are
> never sent automatically — the user picks "Send to group" (which opens the
> iOS message composer, pre-filled, and sends from their own number), "Copy
> link", or "Send individually". Every Twilio message is prefixed "flaky:" and
> carries STOP/HELP instructions. No marketing is ever sent. Before penciling
> someone in, the user confirms they have permission to add that number.

## Privacy nutrition labels

App Store Connect → App Privacy. Answer **"Yes, we collect data"**, then declare
exactly these. Nothing here is used for tracking, so answer **No** to "used for
tracking purposes" on every item.

| Data type | Category | Linked to identity | Purpose |
|---|---|---|---|
| Phone number | Contact Info | Yes | App Functionality |
| Name (optional display name) | Contact Info | Yes | App Functionality |
| Plans: dates, participants, cancel flags | User Content → Other User Content | Yes | App Functionality |
| Product interaction | Usage Data | No | Analytics |

Notes for whoever fills this in:

- **Phone number** covers both the signed-in user's number and the numbers they
  add to a plan. Declare it once.
- **Contacts** is deliberately *not* declared. The contact picker
  (`ContactPickerPlugin.swift`) is `CNContactPickerViewController`, which runs
  out of process — the app never reads the address book and only ever receives
  the single number the user taps. If a reviewer queries this, that's the answer.
- **Product interaction** is Vercel Analytics (`@vercel/analytics` in
  `src/app/layout.tsx`). It is first-party and anonymous — not linked to the
  user, not tracking.
- **Sign in with Apple** (Guideline 4.8) does not apply. That rule is triggered
  by third-party *social* login; phone + SMS verification is first-party.

## Listing copy

**Subtitle** (30 char limit — 24 used)

> Cancel plans, guilt-free

**Promotional text** (170 chars; editable later without a review)

> Secretly flag that you want to cancel. If they feel the same, you're both
> off the hook — and nobody ever knows you were the one having second thoughts.

**Keywords** (100 char limit, comma-separated, no spaces after commas — the
app name is already indexed, so don't repeat it)

> cancel,plans,flake,bail,friends,social,rsvp,calendar,nightin,guiltfree,introvert,excuse

**Description**

> Some plans you want to keep. Some you'd quietly love to get out of — but
> nobody wants to be the one who cancels.
>
> flaky is for the second kind.
>
> Pencil in a plan with a friend. If you start having second thoughts, tap
> flake. Nothing happens. Nobody is told. Your secret is safe.
>
> But if everyone in the plan taps flake, the plan is off — and you all find
> out together. No awkward text, no one who backed out first. Just a quiet
> night in that everybody secretly wanted.
>
> HOW IT WORKS
>
> 1. Sign in with your phone number
> 2. Pencil in a plan — who, what day, and roughly when
> 3. Send the invite straight to your group chat, or to each person separately
> 4. Having second thoughts? Tap flake. If everyone does, you're all off the hook
>
> WHY IT WORKS
>
> Cancelling is rarely about not liking someone. It's about not wanting to be
> the one who lets them down. flaky takes that away: you never reveal you
> wanted out unless they wanted out too.
>
> Plans disappear after a week. You can delete your account, and everything in
> it, at any time from inside the app.

## Store listing

| Field | Value |
|---|---|
| Name | Flaky Meetings |
| Bundle ID | `app.flaky.ios` |
| Privacy policy URL | https://flaky.me/privacy |
| Support URL | **needs deciding — see below** |
| Age rating | 4+ expected; answer the questionnaire honestly, there's no mature content |
| Category | Social Networking (Lifestyle is a reasonable alternative) |

Apple requires the **Support URL** to be a reachable web page, not a `mailto:`.
Right now the only contact route is `feedback@flaky.me`, which appears on
/privacy and at the bottom of the app. Either point Support URL at
https://flaky.me/privacy, or add a small /support page.

Screenshots: iPhone only now that the target is `TARGETED_DEVICE_FAMILY = 1`, so
no iPad set is needed. App Store Connect states the exact required sizes on the
upload screen — check there rather than trusting a stale list.

## TestFlight first

Worth doing a limited rollout before the public release. Same binary, same
upload — TestFlight and the App Store are two destinations for one build, so
nothing is wasted if you promote it later.

**Internal testers** (up to 100, must be on your App Store Connect team) need no
review at all. The build is available within minutes of processing. This is the
fastest way to get flaky onto a few real phones.

**External testers** (up to 10,000, invited by email or public link) require
**Beta App Review**. It is lighter than full App Store review and usually turns
around inside a day, but it checks the same things that matter here — so the
demo accounts above still need to work, and the review notes still need filling
in. Everything in this document applies.

What to fill in under TestFlight → Test Information:

- **What to Test** — steer people at the mechanic, because it is not obvious
  from the outside: pencil in a real plan with a friend, both tap flake, see
  what happens. Ask them specifically whether the invite SMS arrived and
  whether "Send to group" opened Messages with the right people.
- **Feedback email** — `feedback@flaky.me`.
- Enable **automatic screenshot and feedback capture** in TestFlight; testers
  can then shake to report, which is far more likely to reach you than email.

Two practical notes. Builds expire after **90 days**, so a slow beta needs
re-uploading. And your Twilio spend scales with testers — the 30-texts-per-day
budget is per person, so twenty testers is a plausible 600 texts a day. Watch
the Twilio console during the first week.

## Before each upload

- `CURRENT_PROJECT_VERSION` must increase for every build uploaded, even a
  re-upload of the same version. `MARKETING_VERSION` is the public version.
- The iOS app loads https://flaky.me remotely (`capacitor.config.ts`), so **any
  web change must be deployed to production before the build is reviewed** —
  shipping the binary alone changes nothing.
- Export compliance is pre-answered by `ITSAppUsesNonExemptEncryption = false`
  in `Info.plist`, so the upload won't prompt.

## Known risk: Guideline 4.2 (minimum functionality)

The app is a `WKWebView` pointed at the live site with no bundled web assets.
The native contact picker is currently the only thing that isn't the website.
This is the most common rejection for Capacitor apps. Push notifications for the
pencilled-in and mutually-cancelled events would resolve it properly, and would
also cut the Twilio bill.

## Environment

Both must be set in Vercel production and deployed before review:

```
FLAKY_DEMO_PHONES=+12025550143,+13105550123
FLAKY_DEMO_CODE=432735
```

Two constraints, both verified the hard way in the simulator — get either wrong
and the reviewer cannot sign in at all:

1. **`FLAKY_DEMO_CODE` must be exactly 6 digits.** The code input strips
   non-digits and caps at `maxLength={6}`, and Verify stays disabled below 6
   characters. A longer or alphanumeric code physically cannot be entered.
2. **Demo numbers must pass `libphonenumber-js/max` validation**, or sign-in is
   rejected before the demo check runs. The NANP 555-01xx fiction range
   validates; `+15551234567` and the UK `+447700900xxx` range do **not**.

Rotate `FLAKY_DEMO_CODE` after review — it is a standing credential. Brute force
is bounded by the existing 5-per-10-minutes limit on `rl:verify:{phone}`.

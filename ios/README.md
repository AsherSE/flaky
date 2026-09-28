# flaky — iOS App

Native iOS shell for the flaky web app, powered by [Capacitor](https://capacitorjs.com).

## Prerequisites

- macOS with **Xcode 15+** installed
- An Apple Developer account (free works for simulators; paid required for App Store / TestFlight)
- CocoaPods (`sudo gem install cocoapods` or `brew install cocoapods`) — only needed if you add plugins with Pod dependencies

## Quick start

```bash
# From the repo root:

# 1. Sync web assets & plugins into the native project
npm run cap:sync

# 2. Open in Xcode
npm run cap:open
```

In Xcode: select a simulator (or your device), hit **Run** (Cmd+R).

## Development

To test against your local Next.js dev server instead of the production URL:

```bash
# Terminal 1 — start Next.js
npm run dev

# Terminal 2 — sync Capacitor pointing at localhost
npm run cap:dev

# Then open Xcode and run
npm run cap:open
```

The `cap:dev` script sets `CAPACITOR_SERVER_URL=http://localhost:3000` so the
WebView loads your local server. Make sure your Mac and device/simulator can
reach `localhost:3000`.

## App Store / TestFlight

1. In Xcode, set your **Team** and **Bundle Identifier** under *Signing & Capabilities*.
2. Select **Any iOS Device** as the build target.
3. **Product > Archive**, then distribute via App Store Connect.

## Adding native plugins

```bash
npm install @capacitor/contacts   # example
npm run cap:sync
```

Then use the plugin's JS API in your web code — the native bridge is injected
automatically.

## iMessage drawer app (proof of concept)

`App/FlakyMessages/` holds an iMessage extension. It puts flaky in the Messages
app drawer, next to Photos and Polls:

1. Tap flaky in the drawer, pick a day, then **Add to chat**. A
   "Sat 3 Oct is flaky-protected" bubble goes into the input field for you to send.
2. Anyone in the chat taps the bubble and can **Flake secretly**.
3. When the last person flakes, their phone replaces the bubble with
   "Plan's off. Everyone flaked." Until then nobody learns anything.

It needs no sign-in and never sees phone numbers. Messages gives each person an
anonymous per-device id, and the plan travels in the bubble's URL. The server
side is `src/app/api/imessage/` and `src/lib/imessage-plan.ts`. Android and Mac
recipients get the link, which opens `/i/{id}` on the website.

### Adding the target (one time, about 5 minutes)

The files aren't wired into `App.xcodeproj` yet. Hand-editing the project file
is an easy way to break the main app's build, so do this in Xcode:

1. `npm run cap:open`
2. **File → New → Target… → iMessage Extension**. Name it `FlakyMessages`,
   language Swift, and make sure **Embed in Application** is `App`. If Xcode
   offers to activate the scheme, say yes.
3. Xcode creates a `FlakyMessages` group with its own `MessagesViewController.swift`.
   Delete that file (Move to Trash).
4. Drag the four `.swift` files from `App/FlakyMessages/` into that group. Tick
   **only** the `FlakyMessages` target, and untick "Copy items if needed".
   Keep the generated `MainInterface.storyboard`, which already points at
   `MessagesViewController`.
5. Under the target's **General** tab, set **Minimum Deployments** to iOS 15.0
   to match the app. Under **Signing & Capabilities**, pick the same team.
6. Pick the `FlakyMessages` scheme and Run. Choose **Messages** as the host app.
   The simulator has two fake conversations, so you can play both sides.

The drawer icon is blank until you fill in the extension's `iMessage App Icon`
asset.

### Pointing it at a different server

It talks to `https://flaky.me` by default. To use a local or preview server,
add a `FlakyAPIBase` string (such as `http://192.168.1.20:3000`) to the
extension's Info. Vercel preview deployments behind Deployment Protection will
reject the extension's calls, so the simplest real-device test is to deploy the
API routes to production. They're additive and don't touch existing plans.

### Known POC limits

- **Group size is fixed at creation.** The plan needs as many flakes as there
  were people in the chat when it was dropped in. People joining later don't count.
- **Nothing proves a voter is really in the chat.** Someone with the plan link
  could forge extra voter ids and force a cancellation. That needs Apple's
  participant ids to be checked, which they can't be server-side. For friends'
  plans it's an acceptable risk; it isn't for anything that matters more.
- **Separate from phone-number plans.** Drawer plans don't show in the main
  app. That's deliberate for now, and TODO #1's data model is where they'd merge.

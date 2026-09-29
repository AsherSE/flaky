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

## iMessage extension

`FlakyMessages/` is a Messages app extension: pick a day in the Messages app
drawer and it drops an invite link into the chat. It pencils plans in as
whoever is signed in to the main app — the web view hands its session token to
native code (`SharedSessionPlugin`), which stores it in a keychain group both
targets share (`Shared/SharedSession.swift`).

It talks to `FLAKY_SERVER_URL` (a build setting, `https://flaky.me` by default).
To point it at a local server in the simulator:

```bash
xcodebuild -scheme App -destination 'platform=iOS Simulator,name=iPhone 17 Pro' FLAKY_SERVER_URL=http://localhost:3000 build
```

Invite links open the app directly (universal links, `applinks:flaky.me`),
served from `src/app/.well-known/apple-app-site-association`.

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

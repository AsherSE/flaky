# flaky

Cancel plans, guilt-free. Secretly flag that you want to cancel — if they feel the same, you're both off the hook.

## How it works

1. Verify your phone number
2. Enter the other person's number and the day you have plans
3. If they also flag it, you both get a cosy guilt-free message. If not, your secret stays safe.

## Setup

### Prerequisites

- Node.js 18+
- An [Upstash Redis](https://console.upstash.com) database (free tier works)
- A [Twilio](https://console.twilio.com) account with:
  - A **Verify Service** (for SMS codes)
  - A phone number (for sending notification texts)

### Install

```bash
npm install
```

### Environment variables

Copy the example and fill in your keys:

```bash
cp .env.example .env.local
```

| Variable | Where to get it |
|---|---|
| `UPSTASH_REDIS_REST_URL` | Upstash console → your database → REST API |
| `UPSTASH_REDIS_REST_TOKEN` | Same place |
| `TWILIO_ACCOUNT_SID` | Twilio console → Account Info |
| `TWILIO_AUTH_TOKEN` | Twilio console → Account Info |
| `TWILIO_VERIFY_SERVICE_SID` | Twilio console → Verify → Services → create one |
| `TWILIO_PHONE_NUMBER` | Twilio console → Phone Numbers (e.g. `+15551234567`) |

### Run locally

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

### Deploy to Vercel

```bash
npx vercel
```

Add the environment variables in your Vercel project settings, or via the CLI:

```bash
npx vercel env add UPSTASH_REDIS_REST_URL
# repeat for each variable
```

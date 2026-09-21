# lifttrace-strava-sync

A small Cloudflare Worker that relays completed [LiftTrace](https://github.com/TraceApps/lifttrace)
workouts to Strava as "WeightTraining" activities.

Single-user, self-hosted, no shared infrastructure — you deploy your own
copy with your own Strava app credentials and your own webhook secret.
Nobody's tokens ever leave their own Cloudflare account. If you're a
LiftTrace self-hoster and want this too, fork/clone this repo and follow
the setup below with your own values; there's no shared hosted version of
this to sign up for, by design.

## How it works

1. LiftTrace fires a signed `workout.completed` webhook when you mark a
   session complete.
2. This Worker verifies the signature, turns the exercise/set log into a
   Strava activity (`sport_type: WeightTraining`, description built from
   your sets), and posts it via the Strava API.
3. A `/oauth/start` → `/oauth/callback` pair handles the one-time Strava
   authorization; the resulting access/refresh tokens live in this
   Worker's own KV namespace, refreshed automatically when they expire.

## Setup

### 1. Register a Strava API app

[strava.com/settings/api](https://www.strava.com/settings/api) → create
an app. **Authorization Callback Domain** must match wherever this Worker
ends up deployed (its `*.workers.dev` subdomain, or a custom domain).
Note the **Client ID** and **Client Secret**.

### 2. Create the KV namespace

```bash
wrangler kv namespace create STRAVA_TOKENS
```

Paste the resulting `id` into `wrangler.jsonc`'s `kv_namespaces[0].id`.

### 3. Set your Strava Client ID

Edit `wrangler.jsonc`'s `vars.STRAVA_CLIENT_ID` (not sensitive — it's
visible in the OAuth redirect URL regardless).

### 4. Set secrets

```bash
wrangler secret put STRAVA_CLIENT_SECRET
wrangler secret put LIFTTRACE_WEBHOOK_SECRET   # generate one: openssl rand -base64 32
```

For local dev, copy `.dev.vars.example` to `.dev.vars` and fill in the
same two values (gitignored, never commit it).

### 5. Deploy

```bash
npm run deploy
```

Note the Worker's URL — you'll need it in the next two steps.

### 6. Authorize against Strava

Visit `https://<your-worker>/oauth/start` in a browser, sign in, approve.
You'll land on `/oauth/callback`, which stores your access/refresh tokens
in KV. Re-run this any time you need to re-authorize (a new Strava app,
revoked access, etc.) — it always overwrites the stored tokens.

### 7. Create the webhook in LiftTrace

Settings → Webhooks → new webhook:

- URL: `https://<your-worker>/webhook`
- Events: `workout.completed`
- Secret: the **same value** you set as `LIFTTRACE_WEBHOOK_SECRET` above

Use the Settings UI's "Test" button first — this Worker acks LiftTrace's
`test` event (signature + connectivity check) without touching Strava, so
a green test confirms the wiring before your next real workout does.

## Design notes / known limitations

- **`elapsed_time` is a guess when LiftTrace has no `duration_min`.**
  Strava requires it; a rep/weight log alone doesn't measure session
  length. Defaults to 45 minutes — edit `DEFAULT_ELAPSED_SECONDS` in
  `src/strava.ts` if that's consistently wrong for you.
- **`start_date_local` is back-computed** from the webhook's completion
  timestamp minus the elapsed-time estimate above, so the activity's end
  time roughly lines up with when you actually finished.
- **Single-user, single KV key.** Making this multi-tenant (one relay
  serving several LiftTrace instances/Strava accounts) would need a
  per-installation key, a way to route an incoming webhook to the right
  one, and separate Strava app credentials or a properly scoped shared
  app — not something this repo does today.

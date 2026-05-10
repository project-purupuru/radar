# Railway Operations Runbook

> Operating procedures for `radar` deployed to Railway. Demo-day insurance + failure-mode escape hatches.

---

## 1 · First-time deploy

### Prerequisites

- Railway account (https://railway.app · sign in with GitHub `notzerker`)
- This repo cloned locally + pushed to `project-purupuru/radar`
- IDL verified or replaced (see [§3 IDL replacement](#3--idl-replacement-procedure))

### Deploy steps

1. Sign in to Railway dashboard
2. **New Project** → **Deploy from GitHub repo** → select `project-purupuru/radar`
3. Railway auto-detects Node + pnpm from `package.json`
4. **Settings → Build & Deploy**:
   - Build Command: `pnpm install --frozen-lockfile && pnpm build`
   - Start Command: `pnpm start` (= `node dist/index.js`)
   - Healthcheck Path: `/health`
   - Healthcheck Status: `200`
5. **Settings → Variables**: configure env vars (all optional — defaults are fine for devnet hackathon):
   ```
   PORT=3000
   SOLANA_RPC_URL=https://api.devnet.solana.com
   SOLANA_WS_URL=wss://api.devnet.solana.com
   INDEXER_PROGRAM_ID=7u27WmTz2hZHvvhL89XcSCY3eFhxEfHjUN5MjzMY6v38
   LOG_LEVEL=info
   CORS_ORIGIN=*
   ```
   (Set `CORS_ORIGIN` to observatory's Vercel URL for prod lockdown later.)
6. **Deploy** → wait ~2-3 min for build + boot
7. **Settings → Networking** → Generate Domain → note the Railway URL (e.g., `radar-production.up.railway.app`)
8. Verify: `curl https://<railway-url>/health` returns 200 with valid JSON

### Expected first-boot logs

```
[radar] listening on http://localhost:3000
[radar] subscribing to logs for program 7u27WmTz2hZHvvhL89XcSCY3eFhxEfHjUN5MjzMY6v38
[radar] subscription confirmed (subscriptionId=N)
[radar] liveness loop started (heartbeat=20s, dead-man=60s)
```

If you see `[radar] listening` but never `[radar] subscription confirmed` within 10s, the indexer subscription failed — check RPC URLs + IDL provenance.

---

## 2 · Plan tier check + UptimeRobot setup (if needed)

### Why this matters

Railway's **Free** and **Hobby** tiers sleep idle services after ~30 min of no traffic. If radar sleeps mid-demo, the WebSocket subscription dies and all the in-process reconnect logic doesn't help — the container itself is offline. **Pro tier does not sleep.**

### Confirm your plan tier

1. Railway dashboard → top-right profile → **Account Settings** → **Billing**
2. Note current plan: Free / Hobby / Pro

### If on Pro

You're good. Skip to [§4 Pre-demo warmup](#4--pre-demo-warmup).

### If on Free or Hobby

Set up [UptimeRobot](https://uptimerobot.com) free monitor (limit: 50 monitors free; we use 1):

1. Sign up / sign in
2. **Add New Monitor**:
   - Monitor Type: **HTTPS**
   - Friendly Name: `radar health`
   - URL: `https://<your-railway-url>/health`
   - Monitoring Interval: **5 minutes**
   - Optional: alert contact (email) so you're notified if it goes red
3. Save and verify monitor shows **Up** within 5 min
4. Pings every 5 min count as traffic → Railway won't sleep the service

**Cost**: $0. UptimeRobot's free tier is sufficient.

---

## 3 · IDL replacement procedure

### When to run this

- zksoju runs `anchor build` and gives you the canonical IDL
- zksoju upgrades the deployed program before D-12 upgrade-authority freeze (§7 R-14)
- `scripts/verify-parser-shape.ts` (sprint task A4) reports a shape mismatch

### Steps

1. Get the IDL JSON from zksoju (gist, file paste, or `target/idl/purupuru_anchor.json` from his build output)
2. Replace `src/idl/purupuru_anchor.json` in this repo
3. Update `src/idl/PROVENANCE.md`:
   ```markdown
   ## Replaced YYYY-MM-DD HH:MM
   - Source: target/idl/purupuru_anchor.json from substrate-side anchor build
   - Substrate commit-sha: <sha>
   - Anchor toolchain: <output of anchor --version>
   - Vendored by: zerker
   - Verification: ran scripts/verify-parser-shape.ts → (passed | failed → <fix notes>)
   ```
4. Run `pnpm typecheck` (catches any breaking type changes)
5. Run `pnpm test` (catches any adapter test breakage)
6. Run `npx tsx scripts/verify-parser-shape.ts` (verifies live parser matches new IDL)
7. Commit + push:
   ```bash
   git add src/idl/
   git commit -m "chore(idl): replace draft with anchor-build output (commit <sha>)"
   git push
   ```
8. Railway auto-deploys on push (watch logs to confirm `[radar] subscription confirmed` after ~2 min)
9. Trigger a test claim via Blink → confirm event appears in `/events/recent`

**Total wall-clock**: ≤ 5 min if substrate side has the IDL ready.

---

## 4 · Pre-demo warmup procedure (2026-05-11 morning)

### Goal

Ensure radar is responding ≤ 5s on `/health` for at least 30 min before demo recording, with `connected: true` and recent `lastEventAt` (or stable `count` if no fresh claims).

### ≥30 min before recording

1. Open Railway dashboard → confirm latest deploy is live + green
2. Open terminal, start a curl loop:
   ```bash
   while true; do
     date
     curl -s https://<railway-url>/health | jq '.'
     sleep 60
   done
   ```
3. Watch for ≥3 consecutive responses with `connected: true` and `mode: "live"` (not `"warmup"`)
4. If UptimeRobot is set up (Free/Hobby tier), it's also pinging — your curl loop is a redundant safety net

### Right before recording

1. Confirm one final `/health` ping shows green
2. Notify zksoju: "ready for the trigger batch — go for it"
3. Watch for events appearing in `/events/recent` as zksoju triggers them
4. Once you see a sample event flow through within 30s, you're cleared to record

### If anything looks weird

- `connected: false` for >60s → run [§5 escape hatches](#5--demo-day-escape-hatches)
- `count` not incrementing despite zksoju's triggers → check RPC URLs + IDL match
- Railway dashboard shows the service as "deploying" or "crashed" → check build/runtime logs

---

## 5 · Demo-day escape hatches

In order of operator response time:

### Tier 1: ≤ 60 seconds (autonomous)

**Symptom**: silent WebSocket disconnect from devnet RPC.

**Mitigation**: `reconnect.ts` dead-man timer detects within 60s, tears down + reconnects with bounded backoff. No human action needed.

**Verify**: `/health` shows `connected: false` briefly during backoff, returns to `connected: true` within ~90s of detection.

### Tier 2: ~2 minutes (RPC swap)

**Symptom**: reconnect loop is failing (devnet RPC node persistently unhappy, or rate limit triggered).

**Mitigation**: swap to Helius RPC.

1. Get a free Helius API key from https://www.helius.dev (signup ~30s)
2. Railway dashboard → radar service → **Variables**:
   - `SOLANA_RPC_URL` = `https://devnet.helius-rpc.com/?api-key=<KEY>`
   - `SOLANA_WS_URL` = `wss://devnet.helius-rpc.com/?api-key=<KEY>`
3. Save → Railway auto-redeploys (~90s)
4. Watch `/health` for `connected: true`

### Tier 3: ~5 minutes (IDL re-vendor)

**Symptom**: events flow through Solana but don't surface in `/events/recent`. Logs show borsh decode errors or unknown discriminator warnings.

**Mitigation**: substrate-side IDL drift. Run [§3 IDL replacement procedure](#3--idl-replacement-procedure).

### Tier 4: ~5 minutes (revert to mock)

**Symptom**: radar is fundamentally broken in a way none of the above mitigations resolve.

**Mitigation**: stop relying on radar; observatory FE renders mocked events for the demo. Tradeoff: loses the "live indexed events" demo claim, but recording can still happen.

1. In `purupuru-ttrpg`'s observatory branch: revert any changes that point at radar's URL
2. Redeploy observatory → it serves mocked events again
3. Frame the demo voiceover as "the substrate is real, the dashboard is the proof, indexing is the bridge — and here's a screen-recording of T-1 dry-run when the bridge worked"

---

## 6 · Common operational checks

### "Is radar alive?"

```bash
curl -s https://<railway-url>/health | jq '{connected, count, mode, lastEventAt}'
```

### "How many events has it seen?"

```bash
curl -s https://<railway-url>/events/count | jq '.count'
```

### "What's in the buffer?"

```bash
curl -s https://<railway-url>/events/recent?limit=10 | jq '.events[] | {slot, signature, element, wallet}'
```

### "Why isn't event X showing up?"

1. Check `/health` — is `connected: true`?
2. Check Railway logs for borsh decode errors (`Failed to deserialize` or `Unknown discriminator`)
3. Compare event signature against Solana Explorer to confirm it actually emitted
4. If event emitted but not in radar: likely IDL drift → [§3](#3--idl-replacement-procedure)

---

## 7 · Post-hackathon: things to do

After demo recording:

- [ ] Set CORS_ORIGIN to observatory's actual Vercel URL (lock down from `*`)
- [ ] Switch from devnet to mainnet (separate cycle, NOT v0)
- [ ] Add persistence layer (Postgres/SQLite) — survives restarts
- [ ] Add aggregations endpoint (counts by element, by hour)
- [ ] Add WebSocket/SSE push for realtime consumers
- [ ] Set up structured monitoring (DataDog, Better Stack, etc.)
- [ ] Review whether sonar↔radar unified GraphQL surface adds value

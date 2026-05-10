---
status: r1 · v0 hackathon scope
type: product-requirements-document
project: radar
parent_initiative: project-purupuru hackathon (Solana Frontier · ship 2026-05-11)
authority: zerker (lane owner)
upstream_authority: zksoju (substrate · anchor program · IDL)
created: 2026-05-09
companion_initiatives:
  - project-purupuru/sonar (EVM indexer · Envio HyperIndex)
  - project-purupuru/purupuru-ttrpg (observatory FE · downstream consumer)
trace_to: project-purupuru/purupuru-ttrpg#5 (zksoju 2026-05-09 issue)
trace_to_pivot: PRD amendment in purupuru-ttrpg/grimoires/loa/prd.md:943-1064 (originally assumed in-repo; superseded by separate-repo decision 2026-05-09 evening)
---

# radar · Product Requirements Document (v0 hackathon scope)

> *"the radar — Solana on-chain event indexer. sister to sonar. listens for signals from the wider sky."*

A standalone TypeScript service that subscribes to a single Solana anchor program on devnet, parses `StoneClaimed` events, buffers them in memory, and exposes them via HTTP for downstream observatory consumption. Hackathon-scoped (ship 2026-05-11); intentionally minimal; sister to sonar's EVM indexer.

---

## 1 · Problem & Vision

### Problem

The purupuru hackathon demo needs a live ActivityRail showing on-chain Solana mints (genesis stone claims) within 30s of the actual mint event. The observatory FE in `project-purupuru/purupuru-ttrpg` currently consumes a synthetic `MintActivity` mock (`lib/activity/mock.ts`). Without a real indexer, the demo's central narrative beat — *"the world has people in it, look, a mint just happened"* — is impossible to substantiate.

The substrate-side anchor program is deployed and emits structured `StoneClaimed` events ([program ID `7u27WmTz2hZHvvhL89XcSCY3eFhxEfHjUN5MjzMY6v38`](https://explorer.solana.com/address/7u27WmTz2hZHvvhL89XcSCY3eFhxEfHjUN5MjzMY6v38?cluster=devnet)). What's missing is the bridge: a process that subscribes, parses, and republishes those events in a shape the observatory can render.

### Vision

A small, focused, standalone service whose only job is to hear Solana and tell the observatory what it heard. Not a pipeline, not an analytics platform, not a multi-program indexer — just *the radar*, a sister to sonar's EVM-side ears.

### Why a separate service (not in-repo with observatory)?

The observatory FE deploys to Vercel (Next.js + edge caching + ISR). Vercel's serverless runtime cannot hold long-lived WebSocket subscriptions to a Solana RPC node. An indexer process MUST run on a long-lived container (Railway, Fly.io, Render). Coupling it into the observatory's Next.js app would either force the FE off Vercel or create a split-deploy mess.

Why not in `sonar` (the existing team indexer)? Sonar is built on Envio HyperIndex, an EVM-only framework. Sonar's `config.yaml` lists Base mainnet (8453) + Base Sepolia (84532); its handler pattern is `Contract.Event.handler` from EVM ABI bindings; its schema thinks in hex addresses + bigint tokenIds + chainIds. Solana's pubkeys + slots + Anchor IDLs don't slot into Envio's framework. Adding Solana to sonar would mean a polyglot subdirectory fighting the framework's identity. A sister service (`radar`) is the natural decomposition.

---

## 2 · Goals & Success Metrics

### G-1 · Live event surfacing

A fresh devnet `StoneClaimed` mint surfaces in the observatory ActivityRail within **≤30 seconds** of the on-chain mint, end-to-end.

**Measurement**: T-1 dry-run on 2026-05-10 + demo-day recording on 2026-05-11. zksoju triggers a claim via `purupuru-blink.vercel.app/preview`; observatory ActivityRail row appears within 30s; `(claimTime → activityRail.recent[0].at)` delta ≤30s.

### G-2 · Demo-day failure-mode survival

The indexer survives the three known demo-day failure modes without going dark:
- Devnet RPC silent WebSocket disconnect (R-13)
- Railway cold-start latency (R-15)
- IDL drift if substrate program is upgraded (R-14)

**Measurement**: Manual WS-kill test passes (reconnect within 60s; visible degraded state in observatory chrome). Pre-recording warmup procedure executed without surprises. Adapter throws cleanly on unknown element bytes rather than silently corrupting.

### G-3 · Independent deploy + clean consumer contract

Observatory FE consumes radar via HTTP fetch only — no shared TypeScript types, no shared dependencies, no shared deploy. Either side can redeploy independently.

**Measurement**: `git diff` shows zero direct imports from radar in observatory source. Observatory's `INDEXER_API_URL` env-var is the sole coupling.

### Quantifiable targets

| Metric | Target | Measurement source |
|---|---|---|
| Event-to-row latency | ≤ 30s | T-1 dry-run + demo recording |
| Reconnect window | ≤ 60s WS-death detection + reconnect | Manual WS-kill test stopwatch |
| Railway cold-start | ≤ 5s first ping | Pre-warmup curl loop |
| HTTP API p99 | ≤ 50ms (in-memory ring buffer reads) | Local benchmark + prod observation |
| Test count | ≥ 14 unit + 4 integration tests passing | `pnpm test` |

---

## 3 · Users & Stakeholders

| Role | Identity | Concern |
|---|---|---|
| **Lane owner** | zerker (`notzerker`) | Builds + deploys + operates radar through demo recording |
| **Substrate dependency** | zksoju (`zkSoju`) | Owns anchor program + IDL + pre-demo event batch trigger + upgrade-authority freeze |
| **Downstream consumer** | observatory FE (`purupuru-ttrpg/feature/observatory-v0`) | Polls `/events/recent` to render ActivityRail rows |
| **Audience** | Solana Frontier hackathon judges | View the live demo recording 2026-05-11 |
| **Operations** | zerker | Same as lane owner; no separate ops handoff |

### Coordination contract

- **zksoju → zerker**: vendored IDL stays valid until D-12 upgrade-authority freeze; pre-demo batch trigger of ~10 fresh devnet claims morning of 2026-05-11
- **zerker → zksoju**: 24h notice if radar surfaces any IDL parsing issues that suggest substrate-side adjustment needed
- **zerker → observatory FE (also zerker)**: HTTP API contract stable for the demo window; CORS allows observatory's Vercel domain

---

## 4 · Functional Requirements

### FR-1 · Subscribe to Solana RPC for `StoneClaimed` events

The service SHALL maintain a live WebSocket subscription via `connection.onLogs(programId, handler, "confirmed")` against the configured RPC endpoint. Events emitted by program `7u27WmTz2hZHvvhL89XcSCY3eFhxEfHjUN5MjzMY6v38` SHALL be parsed using the vendored Anchor IDL via `EventParser`.

**AC-1.1**: Subscription established within 5s of process boot
**AC-1.2**: `StoneClaimed` events from devnet appear in the service's internal state within 5s of confirmed slot
**AC-1.3**: Non-`StoneClaimed` events (other discriminators, malformed logs) are ignored without crashing

### FR-2 · Parse + adapt `StoneClaimed` payload

Each parsed event SHALL be transformed into a normalized internal record matching this shape:

```ts
interface MintActivity {
  signature: string;     // base58 tx signature
  logIndex: number;      // log position within tx (for dedup)
  slot: number;          // Solana slot
  blockTime: number;     // unix timestamp; falls back to Date.now() if null
  wallet: string;        // base58 pubkey (claimant)
  element: "wood" | "fire" | "earth" | "metal" | "water";  // lowercase
  weather: "wood" | "fire" | "earth" | "metal" | "water";  // lowercase
  mint: string;          // base58 pubkey (NFT mint)
}
```

**AC-2.1**: Element byte 1=wood, 2=fire, 3=earth, 4=metal, 5=water (per substrate spec)
**AC-2.2**: Unknown element byte (0, 6+) throws an `Error` with the signature in the message — adapter does not silently corrupt downstream state
**AC-2.3**: Null `blockTime` falls back to `Date.now()` and is flagged in logs (not silently masked)

**Spike requirement (FR-2 hard gate)**: Before adapter implementation, verify what `EventParser.parseLogs()` ACTUALLY emits at runtime against a known prior `StoneClaimed` log line — Anchor IDLs sometimes encode `element` as a struct-tagged enum (variants `Wood/Fire/Earth/...`) rather than a `u8`. Adapter shape must match observed parser output, not assumed bytes.

### FR-3 · In-memory ring buffer with idempotent dedup

Events SHALL be stored in a module-singleton ring buffer with capacity 200 events. Dedup key: `${signature}:${logIndex}`. Eviction policy: oldest first. The dedup `Set` SHALL be kept bounded with the buffer (i.e., evicted events are also removed from the seen-set).

**AC-3.1**: Buffer never exceeds 200 entries
**AC-3.2**: `seen.size === buffer.length` invariant holds after every push
**AC-3.3**: Pushing the same `(signature, logIndex)` twice results in exactly one buffer entry, exactly one subscriber notification

### FR-4 · WebSocket reconnect with liveness detection

The service SHALL detect silent WebSocket disconnect via a `getSlot` heartbeat (polling every 20s) with a 60s dead-man timer. On detected disconnect, the service SHALL tear down the existing subscription, recreate the `Connection`, and re-subscribe. Backoff: 1s → 2s → 4s → 8s → 16s → 30s, capped at 30s.

**AC-4.1**: Slot-advance during heartbeat window resets the dead-man timer
**AC-4.2**: 60s without slot advance triggers reconnect
**AC-4.3**: Reconnect explicitly re-establishes the `onLogs` subscription (not just the Connection)
**AC-4.4**: Backoff is interruptible on shutdown signal (no zombie timers)
**AC-4.5**: `health.connected = false` during backoff windows; `true` once subscription confirmed re-established

### FR-5 · HTTP API for downstream consumers

The service SHALL expose a Hono-based HTTP server with three endpoints:

| Endpoint | Method | Returns |
|---|---|---|
| `/health` | GET | `{ status, service, indexerStarted, lastEventAt, count, connected, mode }` |
| `/events/recent` | GET | `{ events: MintActivity[] }` (last N up to buffer capacity, optional `?limit=N` cap) |
| `/events/count` | GET | `{ count }` (raw event counter; useful for sanity checks) |

**AC-5.1**: All three endpoints respond ≤50ms p99 (in-memory reads)
**AC-5.2**: CORS allows observatory's Vercel domain (configurable via env)
**AC-5.3**: Health response shape stable across versions (consumer contract)

### FR-6 · Configuration via env vars

Service SHALL read configuration from environment variables. No hard-coded URLs or program IDs in source.

| Env var | Default | Required |
|---|---|---|
| `SOLANA_RPC_URL` | `https://api.devnet.solana.com` | No |
| `SOLANA_WS_URL` | `wss://api.devnet.solana.com` | No |
| `INDEXER_PROGRAM_ID` | `7u27WmTz2hZHvvhL89XcSCY3eFhxEfHjUN5MjzMY6v38` | No |
| `PORT` | `3000` | No |
| `LOG_LEVEL` | `info` | No |
| `CORS_ORIGIN` | `*` | No |

**AC-6.1**: Service boots cleanly with no env vars set (all defaults are sensible for devnet hackathon use)
**AC-6.2**: `.env.example` documents all variables

---

## 5 · Technical & Non-Functional Requirements

### Stack (locked)

| Layer | Choice | Rationale |
|---|---|---|
| Runtime | Node 20+ | Standard, Railway-supported |
| Language | TypeScript 5.7 strict | Type safety for Anchor IDL handling |
| HTTP | Hono 4 | Lightest production-grade framework; matches Bun/Edge potential later |
| Solana RPC | `@solana/web3.js` 1.98 | Stable, well-documented, current `onLogs` API |
| Anchor parsing | `@coral-xyz/anchor` 0.30 | `BorshCoder` + `EventParser`; vendored IDL at `src/idl/purupuru_anchor.json` |
| Package manager | pnpm 10 | Matches purupuru-ttrpg + sonar |
| Lint/format | biome 1.9 | Matches sonar |
| Test | vitest 2.1 | Matches purupuru-ttrpg |
| Deploy | Railway (long-lived container) | WebSocket subscription requires it; Vercel ruled out |

### Performance

- HTTP endpoints: ≤50ms p99 (all in-memory; no external calls in hot path)
- Memory: ≤200MB resident (Node baseline + Solana SDK + buffered events)
- Indexer subscription latency: ≤5s from confirmed slot to ring buffer

### Security

- No private keys handled (read-only subscription)
- No user-supplied input executed (only RPC responses + env vars)
- CORS configurable for production lockdown
- Health endpoint exposes only operational state, no payload data
- Rate limit: not v0 (single-tenant hackathon scope; revisit post-hackathon)

### Observability

- Structured logs (JSON in production, pretty in dev) at boot, subscription, reconnect, and event ingestion
- Health endpoint serves as primary "is it alive?" probe
- Optional: emit log line per event with `(signature, slot, element)` for trace-back

### Deployment

- Single Railway service
- Healthcheck path: `/health`
- Build: `pnpm build` produces `dist/`; `pnpm start` runs `node dist/index.js`
- Dockerfile present for portability (Render, Fly, etc.)

---

## 6 · Scope & Prioritization

### In-scope (v0 · hackathon)

- ✅ Single-program subscription (`StoneClaimed` events from `7u27WmTz...`)
- ✅ Tail-mode indexing (live events only; no backfill)
- ✅ Devnet only
- ✅ In-memory ring buffer (no persistence)
- ✅ HTTP REST API (3 endpoints)
- ✅ Reconnect loop survival
- ✅ Railway deploy

### Out of scope (v0)

- ❌ **Persistence layer** — Postgres/SQLite/Hasura. Soju re-triggers events morning of demo; ring buffer is sufficient for the demo window.
- ❌ **Backfill** from before service start. The buffer captures events the service witnessed.
- ❌ **Multi-program indexing**. Only `7u27WmTz...` matters for v0.
- ❌ **Mainnet endpoint switch**. Devnet only; mainnet is a post-hackathon cycle.
- ❌ **Aggregations / analytics** (counts by element, histograms, top wallets). Live feed only for v0.
- ❌ **WebSocket push to consumers** (SSE / WS server). Observatory polls; sufficient for hackathon.
- ❌ **Authentication** on HTTP API. Single-tenant; CORS-gated.
- ❌ **Multi-region / HA**. Single Railway service is sufficient.
- ❌ **GraphQL API**. Sonar has GraphQL via Envio; radar's surface is small enough that REST is appropriate. Revisit if we ever join schemas.

### Phase 1 / post-hackathon

- ~~D-1: Persistence layer~~ — **PARTIALLY pulled forward 2026-05-10** (scope amendment by zerker for mid-flight resilience). Optional minimal Postgres backup shipped: `src/db.ts` + single `mint_activity` table + raw `pg` library (no ORM, no migration framework). DB is BACKUP only — `/events/recent` always reads from ring buffer. `DATABASE_URL` absent → no-op. The full ORM/migrations/multi-table version is still post-hackathon.
- D-2: Mainnet endpoint switch + program ID per env
- D-3: Multi-program indexing (other purupuru anchor programs as they ship)
- D-4: SSE / WebSocket push for real-time consumers
- D-5: Aggregations endpoint (counts by element, by hour, etc.)
- D-6: Sonar↔radar unified GraphQL surface (optional; only if schema-join provides value)

---

## 7 · Risks & Dependencies

### Risk register

| ID | Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|---|
| **R-13** | Devnet RPC silent WS disconnect during demo recording | medium | high | FR-4 reconnect loop + visible health pip in observatory chrome + Helius env-var swap as 2-min escape hatch |
| **R-14** | IDL drift if zksoju upgrades anchor program before D-12 upgrade-authority freeze | low | high | Adapter throws on unknown element byte (FR-2.AC-2.2); re-vendor IDL procedure documented in runbook |
| **R-15** | Railway cold-start eats demo window | low | medium | Warmup procedure ≥30 min pre-record; health endpoint doubles as warmup probe |
| **R-15a** | Railway free-tier sleep behavior (NEW from in-session review 2026-05-09) | medium | high | Confirm Railway plan tier before depending on it; if free, set up external uptime monitor (UptimeRobot) hitting `/health` every 5min to prevent sleep |
| **R-16** | EventParser yields different shape than expected (struct-tagged enum vs u8) | medium | medium | A-phase spike verifies actual parser output before B-phase locks adapter schema |
| **R-17** | Observatory FE consumer drift if HTTP API shape changes mid-build | low | low | API shape locked in PRD §FR-5; observatory consumes via stable contract |
| **R-18** | zksoju doesn't trigger pre-demo events on schedule | low | high | Have zerker manually claim a stone via the Blink as fallback; T-1 dry-run validates the trigger pathway |

### External dependencies

- **anchor program at `7u27WmTz...`** — owned by zksoju, deployed devnet, IDL frozen post-D-12
- **devnet RPC reliability** — out of our control; mitigated by reconnect + Helius escape hatch
- **Railway** — single deploy target; no fallback in v0 (can move to Fly/Render post-hackathon if reliability issues)

---

## 8 · Definition of Done

The hackathon ship gate is when ALL of the following are true:

- [ ] **DoD-1**: Indexer subscribed to devnet and receiving `StoneClaimed` events within 30s of mint (G-1, AC-1.x, FR-2)
- [ ] **DoD-2**: In-memory ring buffer populated with idempotent dedup on `(signature, logIndex)` (AC-3.x)
- [ ] **DoD-3**: HTTP API returns events from `/events/recent` and health from `/health` with documented shapes (FR-5)
- [ ] **DoD-4**: WebSocket reconnect loop survives manual WS-kill test (FR-4, manual test in sprint Phase G)
- [ ] **DoD-5**: IDL vendored at `src/idl/purupuru_anchor.json` with provenance commit-sha noted in `src/idl/PROVENANCE.md`
- [ ] **DoD-6**: Test suite green (`pnpm test`) — adapter unit + ring-buffer unit + reconnect integration + smoke E2E
- [ ] **DoD-7**: Railway deploy live with documented env-var contract; warmup probe stable
- [ ] **DoD-8**: Tested end-to-end with a fresh devnet claim during 2026-05-10 T-1 dry-run; observatory ActivityRail renders the row within 30s
- [ ] **DoD-9**: Railway service warmed ≥30 min before 2026-05-11 demo recording

Sprint-2 is COMPLETE when all 9 boxes are green.

---

## 9 · Sources & traceability

- **GitHub issue**: [project-purupuru/purupuru-ttrpg#5](https://github.com/project-purupuru/purupuru-ttrpg/issues/5) — zksoju 2026-05-09, the original handoff
- **Pre-pivot planning**: `/Users/albert/Documents/GitHub/purupuru-ttrpg/grimoires/loa/prd.md:943-1064` — FR-12 amendment that originally assumed in-repo indexer; superseded 2026-05-09 evening when team architecture audit revealed sonar's Envio framework couldn't host Solana, motivating this separate-repo decision
- **Sister service**: `project-purupuru/sonar` (EVM indexer · Envio HyperIndex 3.0.0-alpha) — radar inherits naming pattern and team architecture role from sonar
- **Substrate authority**: anchor program `7u27WmTz2hZHvvhL89XcSCY3eFhxEfHjUN5MjzMY6v38` deployed on Solana devnet by zksoju; IDL vendored at `src/idl/`
- **Downstream consumer**: `project-purupuru/purupuru-ttrpg` `feature/observatory-v0` branch; observatory FE consumes radar via HTTP fetch
- **In-session adversarial review**: surfaced the Railway free-tier sleep blocker (R-15a above) and EventParser shape verification (R-16 above)

---

## 10 · Forward dispatch

Per Loa workflow:
1. ✅ `/plan-and-analyze` — this PRD
2. ⏭ `/architect` — SDD addendum: full indexer architecture (RPC client, IDL parsing, ring buffer, reconnect, Hono server, deploy)
3. ⏭ `/sprint-plan` — concrete tasks, beads epic, critical path
4. ⏭ `/run sprint-plan` — autonomous execution with circuit breaker
5. ⏭ `/run-bridge` — autonomous excellence loop · kaironic termination at DoD-9

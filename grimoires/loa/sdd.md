---
status: r1 · v0 hackathon scope
type: software-design-document
project: radar
companion_to: grimoires/loa/prd.md
authority: zerker
created: 2026-05-09
trace_to_pivot: project-purupuru/purupuru-ttrpg/grimoires/loa/sdd.md §13 (lines 660-1074) — original architecture assumed in-process Next.js indexer via instrumentation.ts; superseded by separate-repo decision 2026-05-09 evening
---

# radar · Software Design Document (v0 hackathon scope)

> Companion to `prd.md`. Specifies how the indexer service realizes the PRD's functional + non-functional requirements. Hackathon-scoped — minimal, self-contained, defensible under demo-day pressure.

---

## 1 · System overview

```
┌─────────────────────────────────────────────────────────────────────┐
│                         radar (Railway)                              │
│  ┌─────────────────────────────────────────────────────────────┐   │
│  │                   Node 20+ process                           │   │
│  │                                                              │   │
│  │  ┌──────────────┐    ┌──────────────┐   ┌─────────────┐   │   │
│  │  │ Solana RPC   │───▶│  EventParser │──▶│  Adapter    │   │   │
│  │  │ subscribe()  │    │   (Anchor)   │   │ byte→element│   │   │
│  │  └──────┬───────┘    └──────────────┘   └──────┬──────┘   │   │
│  │         │                                       │           │   │
│  │  ┌──────▼────────┐                       ┌─────▼──────┐   │   │
│  │  │ Reconnect     │                       │ Ring Buffer│   │   │
│  │  │ + getSlot     │                       │ (200 evts, │   │   │
│  │  │ liveness      │                       │  dedup)    │   │   │
│  │  └──────┬────────┘                       └─────┬──────┘   │   │
│  │         │                                       │           │   │
│  │         └─────────► Health state ◄─────────────┘           │   │
│  │                          │                                  │   │
│  │  ┌───────────────────────▼───────────────────────────────┐ │   │
│  │  │              Hono HTTP server (port 3000)              │ │   │
│  │  │  /health · /events/recent · /events/count             │ │   │
│  │  └─────────────────────────┬─────────────────────────────┘ │   │
│  └────────────────────────────┼───────────────────────────────┘   │
└──────────────────────────────┼─────────────────────────────────────┘
                                │ HTTP
                                │ (CORS-gated)
                                ▼
                  ┌──────────────────────────────┐
                  │  observatory FE (Vercel)     │
                  │  poll every 10s              │
                  │  └─▶ ActivityRail rows       │
                  └──────────────────────────────┘
```

Single Node process. WebSocket-in (Solana RPC), HTTP-out (observatory). In-memory state. No DB, no cache, no queue.

---

## 2 · Module layout

All paths relative to repo root.

| Path | Purpose | Exports |
|---|---|---|
| `src/index.ts` | Entry point — boots Hono server + indexer subscription | `(none — main)` |
| `src/idl/purupuru_anchor.json` | Vendored Anchor IDL | (data file) |
| `src/idl/PROVENANCE.md` | IDL source commit-sha + vendoring note | (doc) |
| `src/types.ts` | Shared types — `MintActivity`, `RawStoneClaimed`, `IndexerHealth` | types |
| `src/ring-buffer.ts` | Module singleton · last 200 events · dedup on `(sig, logIndex)` | `pushIfNew`, `subscribe`, `recent`, `BUFFER_SIZE` |
| `src/adapter.ts` | `RawStoneClaimed → MintActivity` byte conversion | `stoneClaimedToMintActivity`, `ELEMENT_BY_BYTE` |
| `src/client.ts` | Solana `Connection` + Anchor `EventParser` + subscription handler | `subscribeToLogs`, `disconnect` |
| `src/reconnect.ts` | `getSlot` heartbeat + dead-man timer + bounded backoff loop | `startLivenessLoop`, `stopLivenessLoop` |
| `src/health.ts` | Mutable singleton — `{ lastEventAt, count, connected }` | `getIndexerHealth`, `setConnected`, `recordEvent` |
| `src/server.ts` | Hono app + route handlers | `app` |
| `src/__tests__/adapter.test.ts` | Unit tests | — |
| `src/__tests__/ring-buffer.test.ts` | Unit tests | — |
| `src/__tests__/reconnect.test.ts` | Integration tests with vitest fake timers | — |

### Why this shape

- **Module-singleton state** for ring buffer + health: matches the "one indexer per process" reality. No need for class hierarchies; each module owns its slice of state and exposes a small API.
- **Pure adapter** (no side effects): testable in isolation, no mocking required.
- **Reconnect + client separated**: client owns the *current* subscription; reconnect owns the *liveness machinery*. They communicate via health state + restart calls.
- **Server thin**: Hono route handlers just read from health/ring-buffer. No business logic.

---

## 3 · Data flow

### Happy path (event ingestion)

1. Solana RPC delivers a `Program log:` line via `connection.onLogs(programId, handler, "confirmed")`
2. Handler in `client.ts` invokes `eventParser.parseLogs(logs.logs)`
3. EventParser yields parsed events — only those matching the `StoneClaimed` discriminator
4. For each event: `adapter.stoneClaimedToMintActivity(rawEvent, signature, slot, blockTime)` → `MintActivity`
5. `ringBuffer.pushIfNew(mintActivity)` — dedup on `(signature, logIndex)`; returns `true` if new
6. On `true`: `health.recordEvent()` updates `lastEventAt + count`; subscribers notified

### Reconnect path

1. `reconnect.startLivenessLoop()` invokes `getSlot()` every 20s
2. Each successful slot read updates last-seen-slot + resets dead-man timer
3. If 60s passes without slot advance → `disconnect()` current subscription, `setConnected(false)`
4. Backoff: 1s, 2s, 4s, 8s, 16s, 30s, 30s, ... (capped)
5. After backoff: re-create `Connection`, re-call `client.subscribeToLogs(handler)`, `setConnected(true)` once subscription confirmed
6. Loop continues forever until shutdown signal

### HTTP request path

1. Observatory FE polls `GET /events/recent?limit=50` every 10s
2. Hono handler reads `ringBuffer.recent(limit)` → array of `MintActivity`
3. Returns `{ events: MintActivity[] }` as JSON
4. Total handler latency ≤ 5ms (in-memory read)

---

## 4 · Type contracts

### `MintActivity` (the public shape)

This is what `/events/recent` returns. Stable across radar versions; observatory FE depends on it.

```ts
export interface MintActivity {
  signature: string;     // base58
  logIndex: number;      // log position within tx
  slot: number;
  blockTime: number;     // unix ms; falls back to Date.now() if RPC returns null
  wallet: string;        // base58 pubkey
  element: Element;      // lowercase string
  weather: Element;
  mint: string;          // base58 pubkey
}

export type Element = "wood" | "fire" | "earth" | "metal" | "water";
```

### `RawStoneClaimed` (the internal Anchor parser output)

**SHAPE TBD UNTIL FR-2 SPIKE COMPLETES.** Two candidates depending on what `EventParser.parseLogs()` actually emits:

**Candidate A** — if `element` IDL field is `u8` (most likely):
```ts
interface RawStoneClaimed_A {
  wallet: PublicKey;
  element: number;  // 1-5
  weather: number;  // 1-5
  mint: PublicKey;
}
```

**Candidate B** — if `element` IDL field is struct-tagged enum:
```ts
interface RawStoneClaimed_B {
  wallet: PublicKey;
  element: { wood: {} } | { fire: {} } | { earth: {} } | { metal: {} } | { water: {} };
  weather: { wood: {} } | { fire: {} } | { earth: {} } | { metal: {} } | { water: {} };
  mint: PublicKey;
}
```

The adapter's branch logic depends on which candidate matches reality. **A4 spike in the sprint plan resolves this** — it's a hard gate before the adapter implementation locks.

### `IndexerHealth`

```ts
export interface IndexerHealth {
  status: "ok" | "degraded" | "starting";
  service: "radar";
  version: string;        // from package.json
  indexerStarted: boolean;
  lastEventAt: string | null;  // ISO 8601
  count: number;          // raw event counter (includes dedup-rejects)
  connected: boolean;     // current WS subscription state
  mode: "live" | "warmup";  // 'warmup' for ~30s post-boot
}
```

---

## 5 · Concurrency model

Single-event-loop Node. No threads, no workers, no shared mutable state across boundaries.

- `ringBuffer.pushIfNew()`: atomic per-call (synchronous JS operations on a single array + Set)
- `health.*`: atomic per-call (single-property assignments)
- `client.onLogs` handler: Solana SDK delivers callbacks serially; no overlap between events of the same subscription
- `reconnect` loop: cooperative — uses `setTimeout` for backoff, can be cancelled

**Race-free invariants** (no locks needed):
- `seen.size === buffer.length` after any `pushIfNew` call
- `health.count` monotonically increases
- `health.connected` reflects last definitive state transition

---

## 6 · Reconnect loop pseudocode

```ts
// src/reconnect.ts (sketch)

let livenessTimer: NodeJS.Timeout | null = null;
let lastSeenSlot: number | null = null;
let lastSlotAt: number | null = null;
let backoffIndex = 0;
const BACKOFF_MS = [1000, 2000, 4000, 8000, 16000, 30000];
const HEARTBEAT_INTERVAL_MS = 20_000;
const DEAD_MAN_THRESHOLD_MS = 60_000;
let cancelled = false;

export async function startLivenessLoop(connection: Connection) {
  cancelled = false;
  while (!cancelled) {
    try {
      const slot = await connection.getSlot();
      if (slot !== lastSeenSlot) {
        lastSeenSlot = slot;
        lastSlotAt = Date.now();
        backoffIndex = 0;  // reset on healthy slot advance
      }
      if (lastSlotAt && Date.now() - lastSlotAt > DEAD_MAN_THRESHOLD_MS) {
        // dead-man triggered
        await triggerReconnect(connection);
      }
    } catch (err) {
      // getSlot itself failed — RPC node down
      await triggerReconnect(connection);
    }
    if (!cancelled) await sleep(HEARTBEAT_INTERVAL_MS);
  }
}

export function stopLivenessLoop() {
  cancelled = true;
}

async function triggerReconnect(connection: Connection) {
  setConnected(false);
  await disconnect();  // tear down old subscription
  const backoff = BACKOFF_MS[Math.min(backoffIndex, BACKOFF_MS.length - 1)];
  await sleep(backoff);
  backoffIndex++;
  if (cancelled) return;
  // recreate connection + re-subscribe
  await subscribeToLogs(/* same handler */);
  setConnected(true);
  lastSlotAt = Date.now();
}
```

**Critical detail**: reconnect MUST explicitly re-call `subscribeToLogs` after `Connection` recreation. The original subscription handle returned by `onLogs(...)` becomes invalid when the underlying WS dies; just re-creating `Connection` doesn't auto-resubscribe. (This was a HIGH-severity finding in the in-session adversarial review of the original sprint plan.)

---

## 7 · Ring buffer logic

```ts
// src/ring-buffer.ts (sketch)

const BUFFER_SIZE = 200;
const buffer: MintActivity[] = [];
const seen = new Set<string>();
const subscribers = new Set<(e: MintActivity) => void>();

export function pushIfNew(event: MintActivity): boolean {
  const id = `${event.signature}:${event.logIndex}`;
  if (seen.has(id)) return false;

  // Insert at end
  buffer.push(event);
  seen.add(id);

  // Evict oldest if over capacity (atomic with Set cleanup)
  if (buffer.length > BUFFER_SIZE) {
    const evicted = buffer.shift()!;
    seen.delete(`${evicted.signature}:${evicted.logIndex}`);
  }

  // Notify subscribers (errors isolated per subscriber)
  for (const cb of subscribers) {
    try {
      cb(event);
    } catch (err) {
      // log but don't propagate — one bad subscriber shouldn't break the rest
      console.error("[ring-buffer] subscriber threw", err);
    }
  }

  return true;
}

export function recent(limit: number = BUFFER_SIZE): MintActivity[] {
  return buffer.slice(-limit).reverse();  // newest-first
}

export function subscribe(cb: (e: MintActivity) => void): () => void {
  subscribers.add(cb);
  return () => subscribers.delete(cb);
}
```

**Invariants** (verified by `__tests__/ring-buffer.test.ts`):
- `buffer.length ≤ BUFFER_SIZE`
- `seen.size === buffer.length` after any `pushIfNew` call
- Idempotent on `(signature, logIndex)` — pushing same id twice = exactly one subscriber notification
- Subscriber errors don't poison the loop

---

## 8 · HTTP server

Hono app with three routes. CORS configurable via `CORS_ORIGIN` env (default `*` for dev).

```ts
// src/server.ts (sketch)

import { Hono } from "hono";
import { cors } from "hono/cors";
import { recent } from "./ring-buffer.js";
import { getIndexerHealth } from "./health.js";

export const app = new Hono();

app.use("*", cors({ origin: process.env.CORS_ORIGIN ?? "*" }));

app.get("/", (c) => c.text("radar — listening from the wider sky"));

app.get("/health", (c) => c.json(getIndexerHealth()));

app.get("/events/recent", (c) => {
  const limit = Math.min(Number(c.req.query("limit") ?? 50), 200);
  return c.json({ events: recent(limit) });
});

app.get("/events/count", (c) => c.json({ count: getIndexerHealth().count }));
```

Server lifecycle managed by `src/index.ts` (entry point); `serve({ fetch: app.fetch, port })` boots it.

---

## 9 · Boot sequence

```
src/index.ts boots:
  1. Read env vars (RPC_URL, WS_URL, PROGRAM_ID, PORT, LOG_LEVEL, CORS_ORIGIN)
  2. Initialize health state: { connected: false, count: 0, lastEventAt: null, mode: "warmup" }
  3. Start Hono HTTP server (immediately responsive on /health for Railway probe)
  4. Start indexer subscription (async):
     a. Create Connection
     b. Vendor IDL → BorshCoder → EventParser
     c. subscribeToLogs(handler)
     d. On first successful subscribe: setConnected(true), mode = "live"
  5. Start liveness loop (async): getSlot heartbeat + reconnect
  6. Process stays alive on the event loop indefinitely
```

**Critical**: HTTP server starts BEFORE indexer subscription, so Railway's healthcheck doesn't fail during the ~5s subscription warmup. Health endpoint reports `mode: "warmup"` during that window.

---

## 10 · Test strategy

| Layer | Tests | Tool |
|---|---|---|
| Unit · adapter | byte 1-5 mappings · invalid byte throws with sig in message · null blockTime fallback · `id === "{sig}:{logIndex}"` | vitest |
| Unit · ring-buffer | push once → recent returns it · push same id twice → 1 entry · push >200 → oldest evicted · seen.size invariant · subscriber error isolation · multiple subscribers all notified | vitest |
| Integration · reconnect | mock getSlot returning monotonic vs stalled · 60s no slot advance triggers reconnect · backoff sequence walks 1→2→4→8→16→30 · cancellable · re-subscribes after Connection recreation | vitest fake timers |
| Smoke · server | each route returns expected shape · CORS header present · /health returns valid JSON | vitest + supertest or fetch |
| E2E · live devnet | manual: trigger claim via Blink, observe ring buffer + observatory row | manual T-1 dry-run |

Target: ≥14 unit + 4 integration tests passing. CI-equivalent local pass via `pnpm test`.

---

## 11 · Deploy contract (Railway)

| Setting | Value |
|---|---|
| Service type | Long-lived Node container (not serverless) |
| Build command | `pnpm install --frozen-lockfile && pnpm build` |
| Start command | `pnpm start` (= `node dist/index.js`) |
| Healthcheck path | `/health` |
| Healthcheck status code | 200 |
| Restart policy | On failure, max 5 retries with 30s delay |
| Required env vars | (none — all defaults are sensible for devnet) |
| Optional env vars | `SOLANA_RPC_URL`, `SOLANA_WS_URL`, `INDEXER_PROGRAM_ID`, `PORT`, `LOG_LEVEL`, `CORS_ORIGIN` |

### Pre-demo warmup procedure

1. ≥30 min before recording: redeploy if any changes pending
2. `curl https://radar.up.railway.app/health` — verify `connected: true`
3. Optional: external uptime monitor (UptimeRobot) hitting `/health` every 5min for the demo window — prevents Railway free-tier sleep
4. zksoju triggers a test claim via Blink; verify event in `/events/recent` within 30s

### Failure-mode escape hatches

| Failure | Mitigation | Time to mitigate |
|---|---|---|
| Devnet RPC dead | Swap `SOLANA_RPC_URL=https://api.helius-rpc.com/?api-key=...` + `SOLANA_WS_URL=wss://...` via Railway env-update + redeploy | ~2 min |
| Railway sleeping | UptimeRobot pings every 5min; manual `curl` warmup if needed | ~30s |
| IDL drift after substrate upgrade | Re-vendor IDL from substrate repo + redeploy | ~5 min |
| Adapter throws on unknown byte | Logs the offending signature; service continues; soju coordinates fix | Variable |

---

## 12 · Scope-flip rationale

This SDD supersedes the architecture spec at `project-purupuru/purupuru-ttrpg/grimoires/loa/sdd.md` §13 (lines 660-1074). Key differences:

| Concept | Old (in-purupuru-ttrpg) | New (in radar) |
|---|---|---|
| Process | Next.js handler + `instrumentation.ts` register hook | Standalone Node process |
| HTTP | Next.js App Router route handlers | Hono app |
| Module location | `lib/indexer/*` in observatory repo | `src/*` in dedicated repo |
| Mock/real seam | `lib/activity/index.ts` env-flag toggle | Observatory polls radar's HTTP API; mock path stays unchanged in observatory repo |
| Deploy coupling | Observatory + indexer share Railway | Observatory on Vercel, radar on Railway, decoupled |
| Type sharing | Shared `MintActivity` import | Duplicated MintActivity type at observatory boundary (or fetched from radar's GET /schema) |

**Why simpler is better here**: Eliminating the in-process Next.js boot via `instrumentation.ts` removes a whole class of HMR-double-subscription / dev-environment / build-coupling concerns. The HTTP boundary is already well-understood by both teams (sonar exposes GraphQL; radar exposes REST; observatory polls).

---

## 13 · Forward dispatch

This SDD is consumed by:
1. `/sprint-plan` → translates §2 module layout + §10 test strategy into 7-phase task plan
2. `/run sprint-plan` → autonomous execution against beads task graph
3. Manual deploy + dry-run on 2026-05-10 evening (T-1)
4. Demo recording 2026-05-11 morning

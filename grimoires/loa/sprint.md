---
status: r1 · v0 hackathon scope
type: sprint-plan
project: radar
sprint_id: sprint-1
local_id: sprint-1
parent_cycle: cycle-001-radar-v0
authority: zerker
created: 2026-05-09
companion_to: grimoires/loa/{prd.md, sdd.md}
demo_recording: 2026-05-11 morning
working_window: ~24-30h (today 2026-05-09 evening → 2026-05-11 AM)
t_minus_1_dry_run: 2026-05-10 afternoon (NOT evening, per in-session review H1 finding)
trace_to_pivot: project-purupuru/purupuru-ttrpg/grimoires/loa/sprints/indexer-sprint.md (originally 21-task in-repo plan; superseded 2026-05-09 evening by separate-repo decision)
---

# Sprint 1 · radar v0 indexer

> **Self-contained indexer service. ~24-30h budget. Demo-ready 2026-05-11 AM.**
> Critical path: A → A4 hard gate → B → C → E → F → G. No parallel branches; single owner (zerker).

---

## 0 · context one-liner

PRD authored 2026-05-09 evening (`prd.md`). SDD authored same session (`sdd.md`). This sprint operationalizes those into 22 concrete tasks across 7 phases, with the two BLOCKER findings from the in-session adversarial review baked in (Railway free-tier sleep, EventParser shape verification).

---

## 1 · executive summary

| | |
|---|---|
| **Sprint goal** | Land radar v0: standalone Solana `StoneClaimed` indexer, deployed to Railway, surfacing events via HTTP within 30s of mint, demo-ready 2026-05-11 morning. |
| **Scope** | LARGE · 7 phases · 22 tasks · ~28h coding + ~6h deploy/dry-run/buffer |
| **Single goal** | DoD checkboxes in `prd.md` §8 all green |
| **Critical path** | A → B → C → E → F → G (D phase deleted from original; mock/real seam lives in observatory repo) |
| **Risk fuses** | R-13 silent WS death · R-14 IDL drift · R-15 Railway cold-start · R-15a Railway sleep (NEW) · R-16 EventParser shape (NEW) |

---

## 2 · time budget (hackathon clock)

| date · time | event | notes |
|---|---|---|
| **2026-05-09 evening** | Phases A scaffold + Phase B core landed | `pnpm typecheck` clean across all modules |
| **2026-05-10 morning** | Phases C + E (HTTP API) | Hono server + 3 endpoints responding |
| **2026-05-10 afternoon (early)** | Phase F (tests) | Unit + integration green |
| **2026-05-10 afternoon (late)** | Phase G1-G3 (Railway deploy + warmup procedure) | Service URL responds 200 on `/health` |
| **2026-05-10 afternoon** | **T-1 dry-run** (G4) | Trigger devnet claim · row visible in observatory ≤30s · WS-kill recovery test (NOTE: moved from evening per H1 review finding — gives 14+ hours overnight buffer instead of 5h) |
| **2026-05-10 evening** | Slack / fix any T-1 dry-run issues | Recovery time before demo |
| **2026-05-11 AM (≥30 min pre-record)** | warm Railway · final smoke | R-15 mitigation |
| **2026-05-11 AM** | demo recording | DoD all green |

Conservative budgeting: 30% slack baked in across phases. If A4 spike surfaces a 4h surprise (EventParser yields struct-tagged enum), Phase F unit tests are first to compress.

---

## 3 · verification model

| level | check | gate |
|---|---|---|
| **task** | task-level AC pass · `pnpm typecheck` clean | next task |
| **phase** | phase-objective demonstrably met · all phase tasks closed | next phase |
| **sprint** | DoD `prd.md` §8 all 9 boxes green · T-1 dry-run end-to-end pass | tag release |
| **demo** | 2026-05-11 AM live recording: claim → row → ≤30s · health pip green · no silent failures | SHIP |

---

## 4 · goal mapping

| ID | Goal | Source | Validation |
|---|---|---|---|
| **G-1** | Live devnet `StoneClaimed` events surface in observatory ActivityRail within 30s of mint | `prd.md` §2 · DoD-1, DoD-8 | Phase G T-1 dry-run + demo recording |
| **G-2** | Indexer survives demo-day failure modes (silent WS death · cold-start · IDL drift · Railway sleep) without going dark | `prd.md` §2 · §7 risks · DoD-4 | Phase F integration test + Phase G WS-kill test + warmup procedure + UptimeRobot |
| **G-3** | Independent deploy + clean consumer contract — observatory consumes radar via HTTP only | `prd.md` §2 · DoD-3 | Phase E API contract verification |

---

## 5 · phase-by-phase plan

### Phase A · Scaffold (foundation · ~2.5h)

> **Objective**: branch cut · IDL vendored · element encoding *confirmed via live parser run*. Hard gate for Phase B (and the Railway plan-tier confirmation for Phase G).

| id | title | est | AC | goal |
|---|---|---|---|---|
| A1 | Branch cut: `feature/v0-indexer` from `main` | 5m | branch exists · `git status` clean before first impl commit | scaffold |
| A2 | Vendor IDL: copy `purupuru_anchor.json` from `project-purupuru/purupuru-ttrpg` branch `feat/awareness-layer-spine` (path `programs/purupuru-anchor/target/idl/purupuru_anchor.json`) into `src/idl/purupuru_anchor.json`. Add `src/idl/PROVENANCE.md` with source commit-sha + vendoring date. → **[G-1]** | 15m | file exists · provenance noted with commit-sha · `pnpm typecheck` still clean | PRD §FR-2 |
| A3 | **🔍 SPIKE · Confirm IDL element encoding** — read vendored IDL · check `StoneClaimed.element` field type (u8 vs struct-tagged enum). If u8: proceed with Candidate A adapter shape (SDD §4). If enum: adjust `RawStoneClaimed` type in B1 + adapter logic in B3 to Candidate B shape **before** Phase B locks. → **[G-1]** | 30m | one-line confirmation in PROVENANCE.md · adapter type comment matches IDL truth | PRD §FR-2 spike requirement |
| A4 | **🔍 SPIKE · Verify EventParser actual output** (closes BLOCKER B2 from in-session review) — write a temporary script `scripts/verify-parser-shape.ts` that loads the vendored IDL into Anchor's BorshCoder + EventParser, then parses a single known prior `StoneClaimed` log line from devnet. Document the actual TypeScript shape it yields in PROVENANCE.md. → **[G-1, G-2]** | 45m | actual EventParser output shape captured · adapter logic in B3 designed against verified shape · script committed to `scripts/` for re-verification post-IDL-update | in-session review B2 blocker |
| A5 | **🔍 SPIKE · Confirm Railway plan tier** (closes BLOCKER B1 from in-session review) — sign in to Railway · verify zerker's plan tier (Free/Hobby/Pro) · document sleep behavior in `docs/RAILWAY_PROCEDURE.md` (NEW) · if Free or Hobby, set up UptimeRobot account + ping every 5min on the eventual deploy URL. → **[G-2]** | 30m | plan tier documented · UptimeRobot configured (or paid plan confirmed) · runbook entry written | in-session review B1 blocker · R-15a |
| A6 | Smoke-build — `pnpm typecheck` + `pnpm build` succeed without referencing `src/index.ts` indexer logic yet (placeholder Hono server stays). Establishes baseline before Phase B introduces new types. | 10m | both commands exit 0 | hygiene |

**Phase A gate**: A3 + A4 + A5 green. If `element` encoding differs from `u8 1-5` (A3), B3 schema changes; if EventParser yields different shape than expected (A4), B1+B3 adapt; if Railway is Free tier (A5), UptimeRobot is required for demo-day insurance.

---

### Phase B · Indexer core (~9h)

> **Objective**: `src/*` modules (excluding `index.ts` entrypoint and `server.ts`) tsc-clean and exporting their published API.

> **Sequencing**: B1 (types) first → then B2/B3/B4/B5 in parallel where possible → B6 (reconnect, depends on B5 client) → B7 (no barrel needed; entry composes them).

| id | title | est | AC | goal |
|---|---|---|---|---|
| B1 | `src/types.ts` — `MintActivity`, `Element`, `RawStoneClaimed` (using verified shape from A4), `IndexerHealth`. | 30m | type signatures match SDD §4 · `pnpm typecheck` green | SDD §4 |
| B2 | `src/ring-buffer.ts` — module singleton · `pushIfNew(event)` returns boolean · `subscribe(cb)` returns unsubscribe · `recent(limit)` returns newest-first · `BUFFER_SIZE=200` · dedup `${signature}:${logIndex}` · `seen.delete()` on eviction · subscriber error isolation. → **[G-3]** | 1.5h | implements API per SDD §7 · tests in F1 verify dedup + eviction + bounded `seen` | SDD §7 · PRD §FR-3 |
| B3 | `src/adapter.ts` — `stoneClaimedToMintActivity(raw, signature, logIndex, slot, blockTime)` · `ELEMENT_BY_BYTE` map · throws `Error` with signature in message on invalid byte · null `blockTime` falls back to `Date.now()` with log. → **[G-1]** | 1h | exports match SDD §4 · pure (no side effects) · throws are catchable | PRD §FR-2 · AC-2.1, AC-2.2, AC-2.3 |
| B4 | `src/health.ts` — module singleton state · `getIndexerHealth()` returns full snapshot · internal setters `setConnected`, `recordEvent`, `setMode` (only `src/*` calls these). → **[G-2]** | 30m | state encapsulated · only ring-buffer + reconnect + boot call setters · server reads via `getIndexerHealth()` | PRD §FR-5 · SDD §4 |
| B5 | `src/client.ts` — `createConnection()` factory reading env vars · `subscribeToLogs(connection, handler)` wires Anchor `EventParser` to PROGRAM_ID · `disconnect(subscriptionId)` tears down. Handler routes parsed events through `adapter.stoneClaimedToMintActivity` → `ringBuffer.pushIfNew` → `health.recordEvent`. → **[G-1]** | 2h | `pnpm typecheck` green · subscription handler chain documented · subscriptionId returned for explicit disconnect | SDD §3 · §6 |
| B6 | `src/reconnect.ts` — `startLivenessLoop(connection)` per SDD §6 pseudocode · 20s `getSlot` heartbeat · 60s dead-man threshold · backoff `1→2→4→8→16→30→30s` (capped) · cancellable via `stopLivenessLoop()` · sets `health.connected` transitions · **explicitly re-calls subscribeToLogs after reconnect** (closes H3 from in-session review). → **[G-2]** | 2.5h | matches SDD §6 listing · backoff interruptible · re-subscribes (not just reconnects Connection) · pure dead-man semantics | PRD §FR-4 · in-session review H3 |
| B7 | (No barrel needed — entry point in C1 composes modules directly. This task is intentionally empty; remove from beads.) | 0m | n/a | n/a |

**Phase B gate**: All modules tsc-clean. No tests yet (Phase F). No runtime exercise yet (Phase G).

---

### Phase C · Boot sequence + Hono server (~2h)

> **Objective**: `src/index.ts` is the production entrypoint that boots HTTP server first, then indexer subscription, then liveness loop. `src/server.ts` is the Hono app.

| id | title | est | AC | goal |
|---|---|---|---|---|
| C1 | `src/server.ts` — Hono app per SDD §8 · CORS middleware (configurable via env) · 4 routes (`/`, `/health`, `/events/recent`, `/events/count`). Reads from health + ring-buffer; no business logic. → **[G-3]** | 45m | `pnpm typecheck` green · routes return correct shapes · CORS header present | PRD §FR-5 · SDD §8 |
| C2 | `src/index.ts` (REPLACE the placeholder from initial scaffold) — boot sequence per SDD §9 · HTTP server starts BEFORE indexer (Railway healthcheck doesn't fail during ~5s subscription warmup) · health initialized to `mode: "warmup"` · indexer + liveness boot async · graceful shutdown on SIGTERM/SIGINT (stop liveness loop, disconnect subscription, server.close). → **[G-2, G-3]** | 1h | full boot sequence works locally · `pnpm dev` shows `[radar] listening` then `[radar] subscribed` · Ctrl+C cleanly shuts down | SDD §9 |
| C3 | `docs/RAILWAY_PROCEDURE.md` — pre-demo warmup procedure · failure-mode escape hatches per SDD §11 · UptimeRobot setup (if needed per A5) · re-vendor IDL procedure (R-14 mitigation). → **[G-2]** | 30m | runbook readable by another operator (or you in 24h after no sleep) | SDD §11 · R-13/R-14/R-15/R-15a |

**Phase C gate**: Service boots locally, responds on `/health`, indexer subscribes (still without real events flowing on devnet — that's E phase smoke).

---

### Phase D · DELETED

> Original sprint had Phase D for `lib/activity/index.ts` mock/real seam wiring. That seam now lives in `project-purupuru/purupuru-ttrpg` (observatory repo); not radar's concern. The observatory-side work is tracked separately as a follow-up after radar v0 ships.

---

### Phase E · API contract + smoke (~1h)

> **Objective**: Verify HTTP API works end-to-end with locally-running indexer.

| id | title | est | AC | goal |
|---|---|---|---|---|
| E1 | Manual smoke — `pnpm dev` locally · curl all 4 endpoints · verify shapes match SDD §4 + PRD §FR-5. Document curl commands in README under "Develop" section. → **[G-3]** | 30m | all 4 endpoints respond · shapes match · headers correct (Content-Type: application/json, CORS) | PRD §FR-5 · SDD §8 |
| E2 | Optional · `/events/recent?limit=N` query parameter test — verify `?limit=5` returns ≤5 events · `?limit=500` clamps to 200 (BUFFER_SIZE max). | 15m | clamp logic verified · query param parsed correctly | PRD §FR-5 · DoD-3 |
| E3 | Hono CORS verification — set `CORS_ORIGIN=https://purupuru-ttrpg.vercel.app` (placeholder for actual observatory FE prod URL) · curl with `Origin` header · verify CORS headers gate correctly. | 15m | CORS allows configured origin · denies others (or returns `*` if config is `*`) | PRD §FR-5 · §5 security |

**Phase E gate**: Local `pnpm dev` serves all 4 endpoints with correct shapes; CORS verified.

---

### Phase F · Tests (~4h)

> **Objective**: Per SDD §10 test strategy. Unit tests are non-negotiable for adapter + ring-buffer. Integration test for reconnect with vitest fake timers.

| id | title | est | AC | goal |
|---|---|---|---|---|
| F1 | **Unit · adapter.ts** (`src/__tests__/adapter.test.ts`) — byte 1..5 → wood/fire/earth/metal/water · byte 0/6/255 throws with signature in error message · `id === "{sig}:{logIndex}"` derivable · null blockTime falls back to current time without crash · base58 wallet/mint preserved correctly · verify against actual EventParser shape from A4. → **[G-1]** | 1h | 5 element mappings + 3 invalid-byte tests + id-format + null-time + base58 = 11 tests · all green | SDD §10 |
| F2 | **Unit · ring-buffer.ts** (`src/__tests__/ring-buffer.test.ts`) — push once → recent returns it · push same id twice → second returns false, no duplicate emit · push past 200 → oldest evicted, **`seen.size === buffer.length === 200`** (closes M2 from in-session review) · subscriber receives each event exactly once · throwing subscriber doesn't poison others · multiple subscribers all notified · unsubscribe stops delivery. → **[G-3]** | 1.5h | 7 tests · all green | SDD §10 · in-session review M2 |
| F3 | **Integration · reconnect.ts** (`src/__tests__/reconnect.test.ts`) — mock `getSlot` returning monotonic + stalled · liveness loop resets dead-man timer on slot advance · 60s without slot advance triggers tear-down + reconnect · backoff sequence walks `1→2→4→8→16→30s` (use vitest fake-timers) · interruptible (cancel signal stops next backoff) · **post-reconnect re-subscribes via subscribeToLogs** (closes H3). → **[G-2]** | 1h | 5 tests · fake timers used correctly · all green | SDD §10 · in-session review H3 |
| F4 | **Optional · malformed event handling** (`src/__tests__/malformed.test.ts`, NEW per in-session review M3) — adapter throws cleanly on extra IDL fields · skips non-StoneClaimed log lines without crashing · multi-event-per-tx scenario (multiple log_index in same signature) — id format dedupes correctly. → **[G-2]** | 30m | 3 tests · all green | in-session review M3 |
| F5 | **Type-check + suite gate** — full repo `pnpm typecheck` + `pnpm test` + `pnpm lint` green. | 30m | all three exit 0 | hygiene · DoD-6 |

**Phase F gate**: ≥14 unit + 4 integration tests passing. Manual e2e is Phase G.

---

### Phase G · Deploy + demo dry-run (~5h spread across 2026-05-10)

> **Objective**: Railway deploy live · T-1 dry-run end-to-end pass · WS-kill recovery test green · service warmed for demo morning.

| id | title | est | AC | goal |
|---|---|---|---|---|
| G1 | **Railway service create + initial deploy** — connect repo · auto-detect Node + pnpm · set env vars per `prd.md` §FR-6 (mostly defaults; CORS_ORIGIN to observatory's Vercel domain when known) · healthcheck path `/health` · build/start commands per SDD §11. → **[G-1]** | 1h | Railway service URL responds 200 on `/health` · `connected=true` within 60s of cold-boot · logs visible | PRD §FR-6 · SDD §11 |
| G2 | **UptimeRobot setup** (if A5 confirmed Free/Hobby tier) — register account · add HTTP(s) monitor on Railway URL `/health` every 5min · verify monitor sees ✓ status. (Skip if A5 confirmed Pro tier.) → **[G-2]** | 20m | monitor active · prevents Railway sleep | R-15a · in-session review B1 |
| G3 | **🔍 SPIKE · Devnet rate-limit headroom probe** — leave radar running for 30min on Railway hitting `api.devnet.solana.com` · count any rate-limit warnings in logs · verify req/s stays well under devnet free-tier ceiling. If ≥50% of cliff, swap to Helius env-var. | 30m | one-line entry in NOTES.md with observed throughput · no rate-limit errors in 30min observation | PRD §7 R-13 |
| G4 | **🎯 T-1 dry-run** (2026-05-10 afternoon — moved earlier per H1 review finding) — coordinate with zksoju to trigger a single devnet claim via `purupuru-blink.vercel.app/preview`. Verify: (a) row appears in `/events/recent` within 30s · (b) observatory ActivityRail (when wired) shows the row · (c) `/health` shows incremented count · capture `(signature, logIndex)` for traceability + screenshot. → **[G-1]** | 1h | row visible · ≤30s elapsed · screenshot saved to `grimoires/loa/dry-run-evidence/T-1-2026-05-10.png` | PRD §FR-1, FR-3 · DoD-8 |
| G5 | **Manual WS-kill recovery test** — on Railway: temporarily change `SOLANA_WS_URL` to a deliberately-broken endpoint (e.g., `wss://invalid.example.com`) then revert. Verify: liveness loop detects within 60s · backoff initiated · health pip flips red (when wired) · subsequent claim still surfaces after restoration. → **[G-2]** | 45m | observed reconnect within bounded backoff window · health transitions visible · no zombie subscriptions in logs · post-reconnect event still flows | PRD §FR-4 · DoD-4 |
| G6 | **Demo-morning warm-up** (2026-05-11 ≥30 min pre-record) — start a curl loop hitting `/health` every 60s. Confirm `connected=true` and increasing/stable count. UptimeRobot also pinging. → **[G-2]** | 30m runbook + 30 min wallclock | service warm · operator confidence high · no cold-start surprise mid-recording | R-15 · DoD-9 |
| G.E2E | **End-to-End Goal Validation** (P0 · MUST COMPLETE before demo recording) — sequenced verification of all three sprint goals: <br>**[G-1]** Trigger fresh devnet claim → row in `/events/recent` ≤30s (G4 evidence sufficient if same-day; otherwise re-run). <br>**[G-2]** Verify reconnect-loop survives WS-kill (G5 evidence). <br>**[G-3]** Verify HTTP API contract: observatory FE (separate repo) successfully fetches `/events/recent` and renders rows. <br>All three must pass before tagging the demo branch. | 30m | all three goals confirmed green · evidence captured in `grimoires/loa/dry-run-evidence/E2E-2026-05-11.md` | DoD all 9 boxes |

**Phase G gate**: T-1 dry-run + WS-kill test + warm-up procedure all green. DoD checklist complete.

---

## 6 · dependencies & critical path

```
A1 ──→ A2 ──→ A3 ──┐
                   ▼
                  A4 (HARD GATE)
                   │
                  A5 (parallel) ─┐
                                 │
                   ▼            │
                  A6 ────────── │
                                 ▼
                            ┌─── B1 ────┐
                            │           │
                            ▼           ▼
                          B2,B3,B4   B5
                            │           │
                            ▼           ▼
                            └────── B6 (after B5) ─┐
                                                   ▼
                                                  C1
                                                   │
                                                   ▼
                                                  C2 → C3
                                                   │
                                                   ▼
                                                  E1, E2, E3
                                                   │
                                                   ▼
                                                  F1, F2, F3, F4
                                                   │
                                                   ▼
                                                  F5
                                                   │
                                                   ▼
                                            G1 → G2 → G3 → G4 → G5 → G6 → G.E2E
```

**Hard gates**:
- **A4** (EventParser shape) before B1+B3
- **A5** (Railway plan tier) before G1+G2 — but A5 can run in parallel with A2-A4
- **G4** (T-1 dry-run) before demo recording

**Soft sequencing**: C2 (entry point) requires all of B1-B6 + C1.

---

## 7 · risk register & per-task mitigations

Mirrors `prd.md` §7. Each risk owns a task-level mitigation:

| ID | Risk | Owning task(s) | Mitigation |
|---|---|---|---|
| **R-13** | Devnet RPC silent WS disconnect during demo recording | B6, E1, G3, G5 | dead-man timer + getSlot heartbeat + visible health · WS-kill verification on Railway |
| **R-14** | IDL drift if zksoju upgrades program before D-12 freeze | A3, A4, B3, C3 | spike + adapter throws on invalid · re-vendor procedure documented |
| **R-15** | Railway cold-start eats demo window | C3, G6 | runbook · warm-up procedure · `/health` doubles as warmup probe |
| **R-15a** | Railway free-tier sleep behavior (NEW) | A5, C3, G2 | confirm plan tier · UptimeRobot if Free/Hobby · runbook docs |
| **R-16** | EventParser yields different shape than expected (struct-tagged enum vs u8) | A4, B1, B3 | spike verifies actual shape · adapter designed against verified output, not assumption |
| **R-17** | Observatory FE consumer drift if HTTP API shape changes mid-build | C1, E1, E3 | API shape locked in PRD §FR-5; explicit smoke test; CORS gate |
| **R-18** | zksoju doesn't trigger pre-demo events on schedule | G4 | manual fallback: zerker triggers via own wallet through Blink · T-1 validates the trigger pathway |

**Demo-day insurance ladder** (in order of operator response time):
1. T+0..60s: reconnect loop catches it autonomously
2. T+60s+: `/health` shows `connected: false` — operator visually aware via observatory pip
3. T+2 min: env-flag swap to Helius (`SOLANA_RPC_URL` Railway env-update + redeploy)
4. T+5 min: full re-vendor IDL + redeploy if substrate-side drift suspected

---

## 8 · sprint-level acceptance criteria

Mirrors `prd.md` §8 DoD:

- [ ] **AC-S1-1** Indexer subscribed to devnet · receives `StoneClaimed` within 30s of mint *(DoD-1)*
- [ ] **AC-S1-2** In-memory ring buffer dedup on `(signature, logIndex)` *(DoD-2)*
- [ ] **AC-S1-3** HTTP API exposes `/events/recent` and `/health` with documented shapes *(DoD-3)*
- [ ] **AC-S1-4** Reconnect loop survives manual WS-kill test *(DoD-4)*
- [ ] **AC-S1-5** IDL vendored at `src/idl/purupuru_anchor.json` with provenance *(DoD-5)*
- [ ] **AC-S1-6** Test suite green: ≥14 unit + 4 integration *(DoD-6)*
- [ ] **AC-S1-7** Railway deploy live + warmup probe stable *(DoD-7)*
- [ ] **AC-S1-8** Tested end-to-end with fresh devnet claim during T-1 dry-run *(DoD-8)*
- [ ] **AC-S1-9** Railway warmed ≥30 min before 2026-05-11 demo recording *(DoD-9)*

Sprint COMPLETE when all 9 boxes are green.

---

## 9 · success metrics (quantifiable)

| metric | target | measurement | source |
|---|---|---|---|
| event-to-row latency | ≤ 30s | `claimTime → ring.recent[0].at` delta on T-1 dry-run | DoD-1 |
| reconnect window | ≤ 60s WS-death detection + backoff | manual WS-kill test stopwatch | DoD-4 |
| Railway cold-start | ≤ 5s first ping | curl loop pre-warm-up | DoD-9 |
| HTTP endpoint p99 | ≤ 50ms | local benchmark | PRD §5 perf |
| test count | ≥ 14 unit + 4 integration | `pnpm test` | DoD-6 |

---

## 10 · what's deferred (NOT in this sprint)

Mirrors `prd.md` §6 out-of-scope:

- D-1: Persistence layer (Postgres/SQLite/Hasura) — post-hackathon
- D-2: Mainnet endpoint switch — separate cycle
- D-3: Multi-program indexing — single program for demo
- D-4: SSE / WebSocket push for real-time consumers — observatory polls for hackathon
- D-5: Aggregations / analytics endpoint — live feed only for v0
- D-6: Sonar↔radar unified GraphQL surface — revisit if useful
- D-7: Rate limiting on HTTP API — single-tenant for hackathon
- D-8: Multi-region Railway deploy — single region sufficient
- D-9: **Observatory-side wiring** (`lib/activity/index.ts` swap to fetch radar) — separate sprint in `purupuru-ttrpg` repo

If any of these surface as "tempting" during execution, defer with a NOTES.md entry.

---

## Appendix A · files touched (exhaustive list)

**NEW** (radar repo):
- `src/idl/purupuru_anchor.json` (vendored)
- `src/idl/PROVENANCE.md`
- `src/types.ts`
- `src/ring-buffer.ts`
- `src/adapter.ts`
- `src/health.ts`
- `src/client.ts`
- `src/reconnect.ts`
- `src/server.ts`
- `src/__tests__/adapter.test.ts`
- `src/__tests__/ring-buffer.test.ts`
- `src/__tests__/reconnect.test.ts`
- `src/__tests__/malformed.test.ts` (optional)
- `scripts/verify-parser-shape.ts`
- `docs/RAILWAY_PROCEDURE.md`
- `grimoires/loa/dry-run-evidence/T-1-2026-05-10.png` (artifact)
- `grimoires/loa/dry-run-evidence/E2E-2026-05-11.md` (artifact)

**MODIFIED**:
- `src/index.ts` (replace placeholder with full boot sequence per C2)
- `README.md` (curl examples added per E1)

---

## Appendix B · forward dispatch

Per Loa workflow:
1. ✅ `/plan-and-analyze` → `prd.md`
2. ✅ `/architect` → `sdd.md`
3. ✅ `/sprint-plan` → this file
4. ⏭ `/run sprint-plan` (or `/run sprint-1`) → autonomous execution; circuit breaker; review + audit gates
5. ⏭ `/run-bridge` → autonomous excellence loop · kaironic termination at G.E2E pass

When zerker resumes session in radar dir:
```bash
cd /Users/albert/Documents/GitHub/radar
claude
# inside Claude Code:
/run sprint-plan
```

The harness will auto-derive task graph from this sprint plan, populate beads if not already done, then dispatch implementation through `/implement` with circuit breaker + review + audit gates.

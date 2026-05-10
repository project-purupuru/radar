@.claude/loa/CLAUDE.loa.md

# radar — Project Instructions

> Project-specific overrides take precedence over framework instructions imported above.

## Project

`radar` — Solana on-chain event indexer for the [Puru ecosystem](https://github.com/project-purupuru). Sister service to [`sonar`](https://github.com/project-purupuru/sonar) (EVM/Envio). Listens to Solana devnet for `StoneClaimed` events from anchor program `7u27WmTz2hZHvvhL89XcSCY3eFhxEfHjUN5MjzMY6v38`, buffers them in memory, exposes them via HTTP for the observatory FE in [`project-purupuru/purupuru-ttrpg`](https://github.com/project-purupuru/purupuru-ttrpg) to consume.

Hackathon-scoped (Solana Frontier · ship 2026-05-11). Demo-ready 2026-05-11 morning.

## Stack

- **Node 20+** runtime (long-lived process; deploys to Railway, not Vercel)
- **TypeScript 5.7** strict mode
- **Hono 4** for HTTP API
- **@solana/web3.js 1.98** — `Connection.onLogs` WebSocket subscription
- **@coral-xyz/anchor 0.30** — `EventParser` + `BorshCoder` for IDL parsing
- **pnpm 10** — package manager (matches `purupuru-ttrpg` + `sonar`)
- **biome 1.9** — lint + format (matches `sonar`)
- **vitest 2.1** — tests (matches `purupuru-ttrpg`)

## Spec

| Artifact | Location |
|---|---|
| PRD | `grimoires/loa/prd.md` |
| SDD | `grimoires/loa/sdd.md` |
| Sprint plan | `grimoires/loa/sprint.md` |
| HANDOFF | `HANDOFF.md` (root) |
| IDL provenance | `src/idl/PROVENANCE.md` |

The PRD's Definition of Done in §8 is the ship gate. Sprint plan §5 phase-by-phase walks from scaffold through demo dry-run.

## Module structure

Per SDD §2:

- `src/index.ts` — entry point (boot order: HTTP server → indexer subscription → liveness loop)
- `src/server.ts` — Hono app + route handlers (read-only)
- `src/types.ts` — `MintActivity`, `Element`, `RawStoneClaimed`, `IndexerHealth`
- `src/ring-buffer.ts` — module-singleton, last 200 events, dedup on `(signature, logIndex)`
- `src/adapter.ts` — `RawStoneClaimed → MintActivity` byte conversion (1=wood..5=water)
- `src/client.ts` — `Connection` factory + `subscribeToLogs` handler chain
- `src/reconnect.ts` — `getSlot` heartbeat (20s) + dead-man timer (60s) + bounded backoff
- `src/health.ts` — mutable singleton state for `/health` endpoint
- `src/idl/purupuru_anchor.json` — vendored Anchor IDL (DRAFT — see PROVENANCE.md)

## Conventions

- **Module-singleton pattern** for ring buffer + health: matches single-process reality. No DI containers.
- **Pure adapter, no side effects**: `adapter.ts` is testable in isolation.
- **Server is thin**: route handlers just read from health/ring-buffer. No business logic in `server.ts`.
- **Entry boots HTTP first**: `/health` responds before indexer subscription completes (Railway healthcheck doesn't fail during ~5s warmup).
- **Reconnect explicitly re-subscribes**: re-creating `Connection` does NOT auto-resubscribe; reconnect logic must re-call `subscribeToLogs` after WS death.
- **Adapter throws on unknown bytes**: better to surface IDL drift loudly than silently corrupt downstream state.

## Loa workflow

This repo uses Loa (mounted as submodule at `.loa/`). Standard golden path:

- `/plan` — already complete (PRD + SDD + sprint exist)
- `/run sprint-plan` — autonomous execution with circuit breaker + review + audit gates
- `/review` + `/audit` — quality gates per sprint completion
- `/run-bridge` — autonomous excellence loop after sprint ships

See `grimoires/loa/NOTES.md` for active sub-goals + decision log.

## What's mocked vs real

| Layer | Status |
|---|---|
| Anchor program | ✅ Real (devnet, deployed by zksoju) |
| IDL | 🟡 DRAFT (hand-derived from Rust source — verify via `scripts/verify-parser-shape.ts` before demo) |
| Solana RPC | ✅ Real (`api.devnet.solana.com` free tier) |
| Pre-demo events | 🟡 zksoju triggers ~10 fresh devnet claims morning of 2026-05-11 |
| Railway deploy | ⏳ Not yet provisioned |
| Observatory consumer | 🟡 In separate repo (`purupuru-ttrpg`) — separate sprint |

## Critical risks

Mirrors `prd.md` §7. Each owns task-level mitigations in `sprint.md`:

- **R-13** Devnet WS silent disconnect → reconnect loop + visible `/health` + Helius env-flag escape hatch
- **R-14** IDL drift if substrate upgrades → re-vendor procedure documented · adapter throws on unknown byte
- **R-15** Railway cold-start → warmup procedure ≥30 min pre-record · `/health` doubles as warmup probe
- **R-15a** Railway sleep (Free/Hobby tier) → confirm plan tier · UptimeRobot if needed
- **R-16** EventParser yields different shape than expected → A4 spike verifies actual shape before B locks adapter

## Coordination

| Person | Lane | Concern |
|---|---|---|
| **zerker** (this) | radar lane owner | Builds + deploys + operates radar through demo |
| **zksoju** | substrate lane | Anchor program · IDL · pre-demo event batch · upgrade-authority freeze |

## Conventions inherited from Loa

- Never edit `.claude/` (use `.claude/overrides/` or `.loa.config.yaml`)
- Never write application code outside of `/implement` skill (or `/run sprint-plan` which wraps it)
- Beads is the single source of truth for sprint task lifecycle
- Maintain `grimoires/loa/NOTES.md` for cross-session memory
- Security first

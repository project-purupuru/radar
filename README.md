# radar

> *"the radar — Solana on-chain event indexer. sister to sonar. listens for signals from the wider sky."*

Real-time Solana event indexer for the [Puru ecosystem](https://github.com/project-purupuru). Subscribes to anchor program logs on devnet (and eventually mainnet) and surfaces them via a lightweight HTTP API consumed by downstream observatory surfaces.

## Status

In active development for Solana Frontier hackathon (ship 2026-05-11).

## What it does

- Subscribes to Solana RPC WebSocket for `StoneClaimed` events from anchor program [`7u27WmTz2hZHvvhL89XcSCY3eFhxEfHjUN5MjzMY6v38`](https://explorer.solana.com/address/7u27WmTz2hZHvvhL89XcSCY3eFhxEfHjUN5MjzMY6v38?cluster=devnet) on Solana devnet
- Parses events using vendored Anchor IDL (`@coral-xyz/anchor` `EventParser`)
- Maintains a recent-events ring buffer (last ~200 events) — restart-resilient within the buffer window via `(signature, log_index)` dedup
- Exposes events via HTTP `/events/recent` for downstream consumers
- Health endpoint `/health` exposing `{ lastEventAt, count, connected }` for monitoring + warmup probes
- Survives silent WebSocket disconnects via `getSlot` liveness polling + bounded backoff reconnect loop

## Sister services

| Repo | Role | Stack |
|---|---|---|
| [`sonar`](https://github.com/project-purupuru/sonar) | the ears — EVM indexer (Base mainnet + Sepolia) | Envio HyperIndex |
| **`radar`** | the radar — Solana indexer (this repo) | Bare Node + Hono |
| [`fukuro`](https://github.com/project-purupuru/fukuro) | the eyes — observatory |  |
| [`score`](https://github.com/project-purupuru/score) | the memory — behavioral intelligence |  |
| [`puru`](https://github.com/project-purupuru/puru) | the skin — design system |  |
| [`contracts`](https://github.com/project-purupuru/contracts) | the bones — smart contracts |  |
| [`world-purupuru`](https://github.com/project-purupuru/world-purupuru) | the experience — UI/battle/collection |  |

## Stack

- TypeScript + Node 20+
- [Hono](https://hono.dev/) for HTTP API
- [@solana/web3.js](https://solana.com/docs/clients/javascript) (`Connection.onLogs` for WebSocket subscription)
- [@coral-xyz/anchor](https://www.anchor-lang.com/) (`EventParser` + IDL parsing)
- pnpm 10
- biome for lint + format
- vitest for tests
- Deployed to Railway (long-lived Node process required for persistent WebSocket subscription — Vercel serverless does not work for this workload)

## Develop

```bash
pnpm install
cp .env.example .env  # edit if needed
pnpm dev              # starts Hono server on :3000 (indexer subscription disabled by default)
```

## API surface (planned)

| Endpoint | Returns |
|---|---|
| `GET /health` | `{ status, service, indexerStarted, lastEventAt, count, connected }` |
| `GET /events/recent` | `[{ signature, slot, blockTime, wallet, element, weather, mint, logIndex }, ...]` (last N events from ring buffer) |
| `GET /events/count` | `{ count }` (raw counter for sanity checks) |

## Project planning

PRD / SDD / Sprint plan land in `grimoires/loa/` once `/plan` runs. The hackathon timeline + acceptance criteria originate from [project-purupuru/purupuru-ttrpg#5](https://github.com/project-purupuru/purupuru-ttrpg/issues/5) (drafted by zksoju 2026-05-09).

## License

AGPL-3.0 (matching team standard)

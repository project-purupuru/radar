# Agent Working Memory (NOTES.md)

> This file persists agent context across sessions and compaction cycles.
> Updated automatically by agents. Manual edits are preserved.

## Active Sub-Goals

- Build radar v0 — Solana StoneClaimed indexer · demo-ready 2026-05-11 AM
- Survive demo-day failure modes (WS disconnect · Railway sleep · IDL drift)
- Independent deploy from observatory FE (Vercel) · radar on Railway · clean HTTP contract

## Discovered Technical Debt

- IDL is currently a DRAFT hand-derived from substrate Rust source. Real `anchor build` output should replace it before demo recording — see `src/idl/PROVENANCE.md` for replacement procedure.
- Discriminator computation in DRAFT IDL assumes default Anchor convention (`sha256("event:StoneClaimed")`). If substrate program uses `#[event(discriminator = "...")]` override, our IDL is wrong. Verify via `scripts/verify-parser-shape.ts` (sprint task A4).

## Blockers & Dependencies

- **zksoju**: anchor program deployed (✅) · IDL not committed (🟡 expected to be vendored from `anchor build` output) · pre-demo event batch trigger (🟡 morning of 2026-05-11) · upgrade-authority freeze (🟡 D-12)
- **Railway plan tier**: confirm Free/Hobby vs Pro before relying on uptime (sprint task A5 · risk R-15a)
- **Devnet RPC reliability**: free tier `api.devnet.solana.com` is the v0 default; Helius env-flag swap is the demo-day escape hatch (sprint runbook · R-13 mitigation)

## Session Continuity

| Timestamp | Agent | Summary |
|-----------|-------|---------|
| 2026-05-09 | mounting-framework | Mounted Loa v1.49 as submodule via local mount-loa.sh (curl-pipe form had a missing-companion-script bug; cloned source first then mounted). |
| 2026-05-09 | scaffold | Initial commit `6f7c1ed`: minimal Node + TypeScript + Hono + biome + vitest scaffold. `pnpm install` clean. `pnpm typecheck` green. Placeholder `src/index.ts` with stub `/health` and `/events/recent` returning empty arrays. |
| 2026-05-09 | post-mount-housekeeping | Commit `333478c`: `.gitignore` updated for Loa submodule symlinks, `.beads/.gitkeep` seeded, `.github/workflows/post-merge.yml` from framework template. |
| 2026-05-09 (autonomous) | plan-and-analyze | PRD authored at `grimoires/loa/prd.md`. v0 hackathon scope. FR-1..FR-6 cover subscription, parsing, ring buffer, reconnect, HTTP API, env config. R-13/R-14/R-15/R-15a/R-16/R-17/R-18 risk register. DoD §8 = 9 boxes. Adapted from purupuru-ttrpg's FR-12 amendment (separate-repo decision 2026-05-09 evening — sonar's Envio framework is EVM-only, so radar is a sister service rather than a sonar subdir). |
| 2026-05-09 (autonomous) | architect | SDD authored at `grimoires/loa/sdd.md`. Module layout (10 modules in `src/`). Reconnect pseudocode (§6). Ring buffer logic (§7). HTTP server thin (§8). Boot sequence (§9). Test strategy (§10). Railway deploy contract (§11). |
| 2026-05-09 (autonomous) | sprint-plan | Sprint plan authored at `grimoires/loa/sprint.md`. 22 tasks across 7 phases (A scaffold · B core · C boot+server · E API contract · F tests · G deploy+dry-run). Hard gates: A3+A4+A5. T-1 dry-run moved from evening to afternoon per in-session review H1 finding. Original Phase D (mock/real seam) deleted — moved to observatory-side sprint in `purupuru-ttrpg`. |
| 2026-05-09 (autonomous) | idl-drafting | Hand-derived IDL at `src/idl/purupuru_anchor.json` from substrate Rust source (`feat/awareness-layer-spine` branch of `purupuru-ttrpg`). PROVENANCE.md documents derivation, discriminator computation (`sha256("event:StoneClaimed")` first 8 bytes = `[138,131,241,101,8,187,119,216]`), and verification + replacement procedures. |
| 2026-05-09 evening (autonomous run) | /run sprint-plan | Phases A–F shipped on `feature/v0-indexer` (6 commits ahead of main). 21 of 22 sprint tasks closed (B7 was always a no-op). A4 spike PARTIAL — script written + run, but no live `StoneClaimed` event has fired on devnet yet (5 sigs found: 3 program upgrades, 1 VerifySignedMessage, 0 claims). Phase B locked to Candidate A shape (element=u8) with adapter runtime guard for drift. A5 + G1-G6 + G.E2E remain HITL-gated (Railway login, T-1 with zksoju, demo-morning warmup). 28/28 vitest tests passing. typecheck + lint clean. HANDOFF.md updated with post-execution state. Surfaced bug in reconnect.ts triggerReconnect — `lastSeenSlot=null` reset was defeating bounded-backoff schedule; fix shipped + integration test added. |
| 2026-05-10 morning | scope-amendment-DB-1 | zerker confirmed Pro tier (closes A5, skips G2). Pulled D-1 (persistence) forward from post-hackathon to v0 for mid-flight resilience: optional Postgres, `pg` library, single `mint_activity` table, fire-and-forget writes from client.ts, boot-warmup hydration in index.ts. `DATABASE_URL` absent → no-op (current behavior preserved). Adds `dbConnected: boolean \| null` to IndexerHealth. 32/32 tests passing (added 4 db tests). Tracked as beads bd-2uw. PRD §6 D-1 amended. |

## Decision Log

| Date | Decision | Rationale | Decided By |
|------|----------|-----------|------------|
| 2026-05-09 | Separate repo (radar) instead of in-repo with observatory | Vercel can't host long-lived WS subscriptions; observatory naturally deploys to Vercel; sonar's Envio framework is EVM-only so couldn't host Solana indexer either. New repo following team's body-parts naming convention (sonar=ears EVM, radar=radar Solana). | zerker (multi-turn negotiation 2026-05-09) |
| 2026-05-09 | Bare Node + Hono (not Next.js, not Bun) | Smallest viable production stack. Hono is the lightest production-grade HTTP framework. Single Railway deploy. | zerker |
| 2026-05-09 | Raw `api.devnet.solana.com` (free) over Helius/Triton/QuickNode | Zero signup friction for hackathon. Helius is the documented escape hatch via env-flag swap if free tier flakes during demo recording. | zerker |
| 2026-05-09 | Vendor IDL now (hand-derived) over wait for `@purupuru/peripheral-events` package | Soju's package is 🟡 in-flight; can't gate radar dev on uncertain timeline. Hand-derived IDL with verification procedure (script + spike) is acceptable risk. | zerker |
| 2026-05-09 | Phase D (mock/real seam wiring at `lib/activity/index.ts`) deleted from radar sprint | Observatory-side concern; lives in `project-purupuru/purupuru-ttrpg`. Radar's contract is HTTP only; how observatory consumes is observatory's choice. | autonomous (per separate-repo decision) |
| 2026-05-09 | T-1 dry-run moved from 2026-05-10 evening to 2026-05-10 afternoon | In-session adversarial review finding H1: afternoon dry-run gives 14+ hours overnight buffer for any failures vs 5h evening. No-cost schedule improvement. | autonomous (per review finding) |
| 2026-05-09 | Address Railway sleep blocker via UptimeRobot if Free/Hobby tier | In-session review BLOCKER B1: Railway Free tier sleeps after ~30min idle, killing WS subscription mid-demo. UptimeRobot pings every 5min count as traffic. Sprint task A5 confirms plan tier; G2 sets up monitor if needed. | autonomous (per review BLOCKER) |
| 2026-05-09 | A4 spike must verify EventParser actual output, not just IDL inspection | In-session review BLOCKER B2: if `element` is encoded as struct-tagged Anchor enum (variants), EventParser yields `{ wood: {} }` not `1`. Adapter shape must match observed output, not assumed bytes. Sprint A4 includes runtime parser run. | autonomous (per review BLOCKER) |

## Sources

- **GitHub issue**: [project-purupuru/purupuru-ttrpg#5](https://github.com/project-purupuru/purupuru-ttrpg/issues/5) — zksoju 2026-05-09 (the original handoff)
- **Pre-pivot planning**: `project-purupuru/purupuru-ttrpg/grimoires/loa/prd.md:943-1064` (FR-12 amendment) + `sdd.md:660-1074` (§13 architecture) + `sprints/indexer-sprint.md` (21-task in-repo plan) — superseded by separate-repo decision
- **Substrate authority**: anchor program `7u27WmTz2hZHvvhL89XcSCY3eFhxEfHjUN5MjzMY6v38` deployed devnet · Rust source on `feat/awareness-layer-spine` branch
- **Sister service**: `project-purupuru/sonar` — EVM indexer via Envio HyperIndex 3.0.0-alpha
- **Downstream consumer**: `project-purupuru/purupuru-ttrpg` `feature/observatory-v0` branch — observatory FE

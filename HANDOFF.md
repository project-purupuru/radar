# HANDOFF · radar v0 indexer

> **For zerker** — supersedes earlier handoff. Phases A–F shipped autonomously 2026-05-09 evening on branch `feature/v0-indexer`. Phase G is the HITL boundary.

## Post-/run-sprint-plan state · 2026-05-09 evening

Branch: `feature/v0-indexer` (5 commits ahead of `main`). Consolidated PR draft pending — see "Your next moves" §1.

### What landed (autonomous)

| Phase | Tasks | State |
|---|---|---|
| A · scaffold | A1 branch · A2 IDL provenance · A3 element=u8 confirmed · A4 spike PARTIAL · A6 smoke build | ✅ green; A4 partial documented |
| B · indexer core | B1 types · B2 ring-buffer · B3 adapter · B4 health · B5 client · B6 reconnect | ✅ all 6 modules typecheck-clean |
| C · boot + server + runbook | C1 server.ts · C2 index.ts boot · C3 runbook (pre-existing) | ✅ HTTP-first boot, graceful shutdown |
| E · local API smoke | E1 curl all 4 routes · E2 ?limit clamp · E3 CORS gating | ✅ verified locally |
| F · tests | F1 adapter (13) · F2 ring-buffer (7) · F3 reconnect integration (5) · F4 malformed (3) · F5 gate | ✅ 28/28 passing — target was ≥18 |

### Sprint goal coverage

| Goal | DoD | Status |
|---|---|---|
| **G-1** live event surface ≤30s | DoD-1 | 🟡 pending live-event verification (Phase G) |
| **G-2** demo-day failure-mode survival | DoD-4 | ✅ reconnect tested (5 integration tests); 🟡 Railway WS-kill pending Phase G |
| **G-3** clean HTTP API contract | DoD-3 | ✅ all 4 routes verified locally |

### What did NOT land (Phase G boundary — needs HITL)

| Task | Why blocked |
|---|---|
| ~~**A5**~~ Railway plan tier | ✅ **Closed 2026-05-10**: Pro tier confirmed. No sleep behavior. R-15a fully mitigated. |
| **G1** Railway service create + initial deploy | Needs zerker Railway auth. Runbook §1 has the full first-deploy steps. |
| ~~**G2**~~ UptimeRobot setup | ✅ **Skipped 2026-05-10**: Pro tier doesn't sleep, no monitor needed. |
| **G3** Devnet rate-limit headroom probe | Needs the deployed service running for 30 min. After G1. |
| **G4** T-1 dry-run | Needs zksoju to trigger a fresh devnet claim. Coordinate 2026-05-10 afternoon. |
| **G5** Manual WS-kill recovery test | Tweak `SOLANA_WS_URL` to broken endpoint on Railway, verify recovery. After G1. |
| **G6** Demo-morning warmup | 2026-05-11 ≥30 min pre-record. Runbook §3. |
| **G.E2E** Final end-to-end goal validation | After G4 + G5. |

**A4 hard gate is PARTIAL**: `scripts/verify-parser-shape.ts` was written and run against devnet, but no `StoneClaimed` event has fired on devnet yet (only program upgrades + 1 `VerifySignedMessage`). Phase B was implemented against the Rust-source-derived Candidate A shape with an adapter runtime guard that throws on shape drift. **Re-run `pnpm tsx scripts/verify-parser-shape.ts` immediately after the first live claim** — it'll capture the actual shape and either confirm Candidate A or surface drift loudly. See `src/idl/PROVENANCE.md` § "A4 spike status" for full detail.

### Your next moves

1. **Push and review the consolidated PR**: 5 commits on `feature/v0-indexer`. Inspect, then merge or request changes.
   ```bash
   git push -u origin feature/v0-indexer
   gh pr view  # auto-created or use `gh pr create`
   ```
2. **G1**: Deploy the service to Railway (Pro tier — no UptimeRobot needed). Runbook `docs/RAILWAY_PROCEDURE.md` §1. Estimated 15 min. **Add Postgres** (one click in Railway: + New → Database → Postgres) — `DATABASE_URL` auto-injects, schema bootstraps at first boot. See runbook §1 "Adding the optional Postgres service."
3. **G4 prep**: ping zksoju to confirm 2026-05-10 afternoon availability for T-1 dry-run trigger.
5. **Re-run A4 spike** after the first live claim (during T-1 dry-run): `pnpm tsx scripts/verify-parser-shape.ts` — verifies Candidate A shape against real EventParser output. If anything mismatches, `src/types.ts:RawStoneClaimed` + `src/adapter.ts` need adjustment before the demo.
6. **G5 WS-kill test**: after G1, follow runbook §5 Tier 2 to swap `SOLANA_WS_URL` to a broken endpoint, verify the reconnect loop catches it within ~60s, restore.
7. **G6 + G.E2E**: 2026-05-11 morning, follow runbook §3 + §7.

### Operating notes

- `pnpm dev` boots HTTP server on `:3000` AND subscribes to devnet (free tier). Use `PORT=3xxx` to avoid clashes.
- Tests pass `pnpm test` clean (28/28). Vitest config inlines `@solana/web3.js` deps to work around an `rpc-websockets` CJS/ESM clash.
- `pnpm typecheck && pnpm test && pnpm lint` is the F5 gate — should stay green on `main` after PR merge.
- A6 added a `pnpm copy-idl` step to the build (`tsc && pnpm copy-idl`) so `dist/idl/purupuru_anchor.json` exists at runtime.

### Risks newly surfaced this run

- ~~**R-15a**~~: ✅ Mitigated by Pro tier (confirmed 2026-05-10) — Railway doesn't sleep on Pro.
- **R-16 still partial**: A4 couldn't validate against a live event. The runtime guard in `src/adapter.ts` catches drift loudly but only after a real event fires. Re-run A4 at T-1.

---

## Original handoff (planning phase) — preserved below

> Original handoff context — the work above superseded most of this. Kept for the audit trail.

---

## What got done autonomously (this session)

### Planning artifacts (all in `grimoires/loa/`)

| Artifact | Status | Key contents |
|---|---|---|
| `prd.md` | ✅ Written (645 lines) | FR-1..FR-6 functional requirements · 7 risks (R-13 thru R-18) · DoD §8 with 9 boxes |
| `sdd.md` | ✅ Written (~370 lines) | 10-module layout in `src/` · reconnect pseudocode · ring buffer logic · Hono server design · Railway deploy contract |
| `sprint.md` | ✅ Written (~450 lines) | 22 tasks across 7 phases · hard gates A3+A4+A5 · BLOCKER findings from in-session review baked in |
| `NOTES.md` | ✅ Populated | Session continuity · decision log · technical debt · blockers |

### Repo scaffold

| File | Purpose |
|---|---|
| `package.json` | Node 20+ · pnpm 10 · Hono 4 · @solana/web3.js 1.98 · @coral-xyz/anchor 0.30 · biome · vitest |
| `tsconfig.json` | ES2022 · NodeNext · strict mode |
| `biome.json` | 2-space indent · double quotes · trailing commas |
| `.gitignore` | Node + Loa submodule symlinks |
| `.env.example` | All 6 env vars documented |
| `src/index.ts` | Placeholder Hono server (replace in sprint task C2) |
| `src/idl/purupuru_anchor.json` | DRAFT IDL — hand-derived from substrate source |
| `src/idl/PROVENANCE.md` | IDL derivation + verification + replacement procedures |
| `README.md` | Project description · sister-service map · API surface table |
| `CLAUDE.md` | Project-specific instructions · stack · spec pointers |

### Loa framework

| | |
|---|---|
| Submodule | `.loa/` (mounted via local `mount-loa.sh`; the curl-pipe form had a missing-companion bug — see NOTES) |
| Symlinks | `.claude/scripts`, `.claude/protocols`, etc. → `.loa/.claude/...` |
| Config | `.loa.config.yaml` (default + submodule mode) |

### Three commits pushed to `main`

```
333478c chore(loa): post-mount housekeeping — gitignore symlinks, beads init, github workflows
ccd604b chore(loa): mount framework as submodule (ref: main)
6f7c1ed init: minimal scaffold for radar Solana indexer
```

A fourth commit lands when you push the planning artifacts (those are uncommitted on radar's local main right now — see "Hand-off state" below).

---

## What still needs doing (your work + the harness's)

### YOUR check-ins (can't be autonomous)

1. **Push the planning commit on radar**: see "Hand-off state" — one `git add` + commit + push when you're back, BEFORE running `/run sprint-plan` so the harness sees the spec.
2. **Run `/run sprint-plan`** in radar's directory (see TL;DR above).
3. **A5 Railway plan tier check**: is your `notzerker` Railway account on Free, Hobby, or Pro? This affects R-15a sleep risk. If Free/Hobby, sprint includes UptimeRobot setup task.
4. **Re-vendor IDL when zksoju has it**: ping zksoju for the real `target/idl/purupuru_anchor.json` from his `anchor build`. Replace the DRAFT in `src/idl/`. The `verify-parser-shape.ts` script (sprint task A4) catches the IDL mismatch automatically if you forget.
5. **T-1 dry-run on 2026-05-10 afternoon**: coordinate with zksoju to trigger a fresh devnet claim while radar is live. Verify ring buffer + observatory ActivityRail.
6. **Demo-day warmup on 2026-05-11 AM** (≥30 min pre-record).

### What `/run sprint-plan` will do (autonomous)

1. Parse `grimoires/loa/sprint.md`
2. Populate beads task graph (32 task entries derived from sprint phases)
3. Dispatch `/implement` for each task, in critical-path order:
   - Phase A: scaffold tasks (A1-A6)
   - Phase B: indexer core (B1-B6, B7 deleted as no-op)
   - Phase C: boot + Hono server (C1-C3)
   - Phase E: API contract verification (E1-E3)
   - Phase F: tests (F1-F5)
   - Phase G: deploy + dry-run (G1-G6, G.E2E)
4. Run `/review-sprint` + `/audit-sprint` after each phase
5. Circuit breaker if 3 consecutive iterations fail on the same task

Estimated harness runtime: 6-12h of autonomous coding (depending on which tasks need HITL gates). The harness will pause for your input at:
- A5 (Railway plan tier — needs your account info)
- A4 spike result (whether EventParser confirms u8 or surfaces enum)
- G1 Railway deploy (needs your auth)
- G4 T-1 dry-run (needs zksoju coordination)

### What's in observatory FE side (separate work, not autonomous)

The original sprint plan in `purupuru-ttrpg/grimoires/loa/sprints/indexer-sprint.md` had a Phase D for `lib/activity/index.ts` mock/real seam. That's been deleted from radar's sprint and is NOT covered here. When radar's HTTP API is live, you'll want a separate small sprint in `purupuru-ttrpg` to:

1. Add `INDEXER_API_URL` to env
2. In `lib/activity/index.ts`: when `INDEXER_API_URL` is set, swap `mockActivityStream` for a `radarPollingStream` that fetches `${INDEXER_API_URL}/events/recent` every 10s and pushes new events into the existing `ActivityStream` interface
3. Optional: add a small health pip to observatory chrome (KpiStrip area) that polls `${INDEXER_API_URL}/health` and shows green/amber/red

This is a small surgical change — maybe 30-60 min of focused work. Do it AFTER radar's API contract is locked and tested (i.e., after Phase E of radar sprint).

---

## Hand-off state · uncommitted on radar

Right now on radar's local main branch, these files are uncommitted:

```
M  CLAUDE.md
?? grimoires/loa/prd.md
?? grimoires/loa/sdd.md
?? grimoires/loa/sprint.md
?? grimoires/loa/NOTES.md  (template was overwritten with populated content)
?? src/idl/
?? HANDOFF.md
```

**Your first action when back**: review the planning artifacts (5-10 min skim), then commit them:

```bash
cd /Users/albert/Documents/GitHub/radar
git add CLAUDE.md HANDOFF.md grimoires/ src/idl/
git commit -m "$(cat <<'EOF'
docs(planning): PRD + SDD + sprint plan + IDL draft for v0 indexer

Adapted from project-purupuru/purupuru-ttrpg's FR-12 amendment after
2026-05-09 evening pivot to separate-repo decision. PRD/SDD/sprint
authored autonomously per /plan + /architect + /sprint-plan workflow.
IDL hand-derived from substrate Rust source on awareness-layer-spine
branch — DRAFT until verified via scripts/verify-parser-shape.ts
(sprint task A4) or replaced with anchor-build output.

In-session adversarial review surfaced 2 BLOCKER findings, both
addressed in sprint plan: (1) Railway free-tier sleep risk → A5
plan-tier confirmation + G2 UptimeRobot, (2) EventParser actual
shape verification → A4 spike runs the parser before B locks.

Closes planning phase. Next: /run sprint-plan in this repo.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
git push
```

Then dispatch the harness:

```bash
claude
# inside:
/run sprint-plan
```

---

## What's also uncommitted on `purupuru-ttrpg` (handle separately)

The OTHER repo (`/Users/albert/Documents/GitHub/purupuru-ttrpg`) has uncommitted planning work from before the separate-repo pivot. That work isn't useless — the FR-12 amendment captured negotiated decisions, the SDD §13 had architectural thinking, the sprint plan had task scaffolding. But it's now SUPERSEDED by what's in this radar repo.

When you have a moment, commit the purupuru-ttrpg state with a note that the indexer moved to radar. Specific files:
- `grimoires/loa/prd.md` (FR-12 amendment lines 943-1064 — keep as historical context, but the in-repo scope flip there is now reversed)
- `grimoires/loa/sdd.md` (§13 lines 660-1074 — superseded by radar's SDD)
- `grimoires/loa/sprint.md` (companion-sprint pointer)
- `grimoires/loa/sprints/indexer-sprint.md` (superseded by radar's sprint.md)
- `grimoires/loa/NOTES.md` (session continuity)
- `grimoires/loa/ledger.json` (sprint-2 registration — that ledger entry is stale now)
- `.beads/issues.jsonl` (epic bd-360 + 32 task beads — STALE; should be marked deleted or just ignored)
- `.loa.config.yaml` (simstim + flatline_protocol enabled)
- `grimoires/loa/a2a/{flatline,gpt-review,trajectory}/` (review audit trail — keep, has historical value)

The cleanest commit message would acknowledge the pivot:

```
docs(loa): planning history — indexer moved to project-purupuru/radar

This commit captures planning artifacts from 2026-05-09 evening before
the separate-repo decision. PRD FR-12 amendment, SDD §13, indexer
sprint plan all assumed in-repo Next.js indexer. Subsequent analysis
(sonar uses Envio = EVM-only; observatory deploys to Vercel = no WS;
team body-parts naming pattern) led to spinning up project-purupuru/radar.

Beads epic bd-360 and the 32 indexer task beads are now stale — radar
maintains its own beads. Flatline degradation log + in-session review
are kept for audit trail.

Future indexer work for the OBSERVATORY SIDE (lib/activity/index.ts
swap to fetch radar API) is a separate small sprint in this repo.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
```

---

## Risks I couldn't address autonomously

Listed in priority order:

1. **IDL is DRAFT, not verified**. The hand-derived `src/idl/purupuru_anchor.json` matches what I see in the substrate Rust source, but until `EventParser.parseLogs()` actually parses a real devnet log line cleanly, we can't know it's correct. Sprint task A4 catches this.
2. **Railway plan tier unknown**. Sprint task A5 has you confirm.
3. **zksoju coordination**. Pre-demo event batch trigger + IDL replacement procedures depend on him being available 2026-05-10 afternoon (T-1 dry-run) and 2026-05-11 morning (demo). Worth a quick ping when you're back to confirm his timeline.
4. **Discriminator computation assumption**. I computed `sha256("event:StoneClaimed")[:8]` per default Anchor convention. If substrate program uses `#[event(discriminator = "...")]` override, our IDL is wrong. The Rust source at `lib.rs:307` shows just `#[event]` (no override), so this should be fine. But A4 spike confirms.
5. **Mount script bug**. `curl ... mount-loa.sh | bash` failed with missing companion file. Worked fine via local clone. Worth filing a Loa upstream issue ([0xHoneyJar/loa](https://github.com/0xHoneyJar/loa/issues)) when you have time.

---

## Time accounting

| Activity | Wall time |
|---|---|
| Repo creation + scaffold + pnpm install | ~15 min |
| Loa mount (including the bug + workaround) | ~10 min |
| PRD draft | ~20 min |
| SDD draft | ~25 min |
| Sprint plan draft | ~25 min |
| IDL hand-derivation + PROVENANCE | ~10 min |
| CLAUDE.md + NOTES.md + HANDOFF.md | ~15 min |
| **Total autonomous prep** | **~2h** |

Remaining hackathon clock when you're back: ~24-28h depending on movie length. Plenty of room for `/run sprint-plan` to do the implementation pass.

---

## Welcome back. Good luck with the demo recording.

If anything in the planning artifacts looks wrong, you can either edit them directly + re-commit, or run `/plan-and-analyze` again with `--fresh` to redo from scratch. The harness reads from `grimoires/loa/sprint.md` so changes there propagate without further regen.

— autonomous Claude (Opus 4.7 1M)

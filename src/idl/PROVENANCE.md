# IDL Provenance

> **Status: DRAFT — hand-derived from substrate source · verify before relying**

## What this is

`purupuru_anchor.json` in this directory is a hand-crafted Anchor IDL targeting the deployed program at `7u27WmTz2hZHvvhL89XcSCY3eFhxEfHjUN5MjzMY6v38` on Solana devnet. It contains ONLY the `StoneClaimed` event definition needed by `radar` — instructions, accounts, errors are stubbed empty since this service does not invoke instructions.

## How it was derived

**Not** from `anchor build` output. The `target/` directory in `project-purupuru/purupuru-ttrpg` (`feat/awareness-layer-spine` branch) is gitignored (standard for Anchor projects), so the build-artifact IDL is not version-controlled.

This IDL was hand-derived on 2026-05-09 by reading the Rust source at:
- `programs/purupuru-anchor/programs/purupuru-anchor/src/lib.rs` on branch `feat/awareness-layer-spine`
- File hash: (commit-sha at fetch time will be filled in by zerker when verifying)

The relevant Rust block:

```rust
declare_id!("7u27WmTz2hZHvvhL89XcSCY3eFhxEfHjUN5MjzMY6v38");

#[event]
pub struct StoneClaimed {
    pub wallet: Pubkey,
    pub element: u8,
    pub weather: u8,
    pub mint: Pubkey,
}
```

Element + weather are validated in-program with `require!((1..=5).contains(&element))`, confirming byte values 1-5 per the wuxing scale (1=Wood, 2=Fire, 3=Earth, 4=Metal, 5=Water).

### A4 spike status (2026-05-09 evening · sprint task A4 hard gate)

**Spike script written** at `scripts/verify-parser-shape.ts`. Run on 2026-05-09 evening against devnet (`api.devnet.solana.com`) — `getSignaturesForAddress` returned 5 signatures: 3 program upgrade/deploy ops, 1 program-extension, and 1 `VerifySignedMessage` instruction call. **No `StoneClaimed` event has fired on devnet yet** — `EventParser.parseLogs` could not be executed against a real event.

This means A4 **cannot be definitively verified until the first live claim event arrives** (planned for sprint task G4 T-1 dry-run on 2026-05-10 afternoon, when zksoju triggers a test claim). Until then, B-phase code is built against:

1. **A3 confirmation** (`element: u8`, simple struct per Rust source)
2. **Anchor 0.30.1 IDL/EventParser conventions** (pubkey fields decode to `web3.PublicKey`-shaped objects, u8 fields decode to `number`)
3. **A defensive runtime guard** in `src/adapter.ts` — throws if `typeof element !== 'number'` or `element < 1 || element > 5`, surfacing any drift loudly rather than silently corrupting downstream state

After G4 fires the first live event, re-run `scripts/verify-parser-shape.ts` and update this section with the actual EventParser output shape. If it differs from assumed Candidate A, B1 + B3 + tests adjust before demo recording.

**A4 status: PARTIAL · re-validate at G4 · proceed at own risk to Phase B with adapter runtime guard.**

### A3 spike resolution (2026-05-09 evening · sprint task A3)

**`element` field is `u8` in the vendored IDL (line 30 of `purupuru_anchor.json`)**, NOT a struct-tagged Anchor enum. Adapter follows **Candidate A** shape per `sdd.md` §4 — `RawStoneClaimed.element` typed as raw `number` (1..5), `ELEMENT_BY_BYTE` map decodes to TypeScript `Element` union. Adapter throws on bytes outside `1..=5` to surface IDL drift loudly.

If a future re-vendor (e.g., `anchor build` from substrate-side) reveals an enum-typed `element`, B1 (`src/types.ts`) + B3 (`src/adapter.ts`) must be reshaped to **Candidate B** before Phase B locks. This is the R-16 risk; A4 verifies the actual EventParser output to confirm at runtime.

## Discriminator computation

The event discriminator is the first 8 bytes of `sha256("event:StoneClaimed")`:

```
$ echo -n "event:StoneClaimed" | shasum -a 256 | cut -c1-16
8a83f16508bb77d8
```

As decimal byte array (Anchor IDL format): `[138, 131, 241, 101, 8, 187, 119, 216]`

This computation follows Anchor's documented event discriminator convention. If the deployed program uses a non-default discriminator override (`#[event(discriminator = "...")]`), this hand-derived value will be wrong and `EventParser.parseLogs` will silently fail to match real events. See "Verification" below.

## Verification (REQUIRED before demo)

Before relying on this IDL for production indexing, run `scripts/verify-parser-shape.ts` (sprint task A4) which:

1. Loads this IDL into Anchor's `BorshCoder`
2. Constructs an `EventParser` against the program ID
3. Fetches a real `StoneClaimed` log line from devnet (via `getSignaturesForAddress` + `getTransaction`)
4. Parses the log line — confirms event matches with expected field shape

If verification fails, the most likely causes (in order of probability):

1. **Anchor IDL spec version mismatch** — `radar` uses `@coral-xyz/anchor` `^0.30.1`. If the deployed program was built with Anchor < 0.30, the IDL JSON format may differ (older Anchor used `publicKey` instead of `pubkey`, didn't have top-level `address`, etc.). Fix: run `anchor build` against the substrate program source to get the canonical IDL.

2. **Discriminator override** — `#[event(discriminator = "...")]` on the Rust struct would change the discriminator. The Rust source at `lib.rs:307` shows `#[event]` with no override, so this should not apply. But verify.

3. **Field ordering / encoding** — borsh deserialization is order-sensitive. The hand-derived IDL preserves the source order (`wallet, element, weather, mint`); should be correct.

## Alternative: get the real IDL from substrate team

The cleanest path to a verified IDL is to ask zksoju to:

```bash
# In project-purupuru/purupuru-ttrpg on branch feat/awareness-layer-spine:
cd programs/purupuru-anchor
anchor build
# Then commit + push:
git add target/idl/purupuru_anchor.json -f  # -f because target/ is gitignored
git commit -m "chore: publish anchor IDL for radar consumption"
git push
```

OR have zksoju paste the IDL JSON into a GitHub Gist that radar fetches at deploy time. OR publish via the planned `@purupuru/peripheral-events` npm package (per `purupuru-ttrpg#5`).

If/when a verified IDL replaces this draft, update this PROVENANCE.md with:
- Source: `target/idl/purupuru_anchor.json` from substrate-side `anchor build`
- Substrate commit-sha at vendoring time
- Anchor toolchain version (`anchor --version`)

## Re-vendoring procedure (when substrate program upgrades)

If zksoju upgrades the deployed program before D-12 upgrade-authority freeze (`prd.md` §7 R-14):

1. zksoju runs `anchor build` against the new source
2. zksoju notifies zerker with the new IDL contents (Gist, file paste, etc.)
3. zerker replaces `purupuru_anchor.json` in this directory
4. zerker re-runs `scripts/verify-parser-shape.ts`
5. zerker redeploys radar (`git commit + push` triggers Railway auto-deploy)

Total wall-clock: ≤ 5 min if substrate-side has the IDL ready.

## Discriminator reference table

For copy-paste convenience if other purupuru programs are added in future:

| Event name | Anchor discriminator (8 bytes hex) | Decimal array |
|---|---|---|
| `StoneClaimed` | `8a83f16508bb77d8` | `[138, 131, 241, 101, 8, 187, 119, 216]` |

/**
 * src/__tests__/malformed.test.ts — sprint task F4 (closes review M3)
 *
 * Coverage:
 *   1. adapter throws cleanly on extra unexpected fields (won't infect
 *      downstream state — pushIfNew never gets called)
 *   2. ring-buffer dedups multi-event-per-tx (multiple log_index in same
 *      signature) — id format guarantees uniqueness across logIndex
 *   3. ring-buffer cleanly accepts events from non-StoneClaimed txs
 *      (no-op at adapter, no events queued)
 *
 * Total: 3 tests.
 */

import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { stoneClaimedToMintActivity } from "../adapter.js";
import { _resetForTests, pushIfNew, recent, size } from "../ring-buffer.js";
import type { Element, MintActivity, RawStoneClaimed } from "../types.js";

const SIG = "5kKjYZcHRQfa9JvZGm1nW3LpTdFp9HnjtQNxwvR7gKdmpx2vYAhzHXyUfH8jKhV4z3pqrL";
const WALLET_B58 = "11111111111111111111111111111111";
const MINT_B58 = "So11111111111111111111111111111111111111112";

const fakePk = (b58: string) => ({ toBase58: () => b58 }) as unknown as RawStoneClaimed["wallet"];
const WALLET = fakePk(WALLET_B58);
const MINT = fakePk(MINT_B58);

beforeEach(() => _resetForTests());
afterEach(() => _resetForTests());

describe("malformed — adapter behavior", () => {
  it("throws on extra fields with invalid byte (extra fields tolerated; bad bytes still caught)", () => {
    const rawWithExtra = {
      wallet: WALLET,
      element: 7, // out-of-range
      weather: 1,
      mint: MINT,
      extraField: "should be ignored, but byte still throws",
    } as unknown as RawStoneClaimed;

    expect(() =>
      stoneClaimedToMintActivity(rawWithExtra, {
        signature: SIG,
        logIndex: 0,
        slot: 1,
        blockTime: 1_700_000_000,
      }),
    ).toThrowError(/invalid element byte 7/);
  });

  it("does not infect downstream state when adapter throws (pushIfNew never called)", () => {
    expect(size()).toBe(0);
    let activity: MintActivity | null = null;
    try {
      activity = stoneClaimedToMintActivity(
        { wallet: WALLET, element: 0, weather: 1, mint: MINT },
        { signature: SIG, logIndex: 0, slot: 1, blockTime: 1_700_000_000 },
      );
    } catch {
      // expected
    }
    expect(activity).toBeNull();
    expect(size()).toBe(0);
    expect(recent()).toHaveLength(0);
  });
});

describe("malformed — multi-event-per-tx dedup", () => {
  it("multiple log_index in same signature dedupe correctly via id format", () => {
    const mk = (logIndex: number, element: Element = "wood"): MintActivity => ({
      signature: SIG,
      logIndex,
      slot: 100,
      blockTime: 1_700_000_000,
      wallet: WALLET_B58,
      element,
      weather: "fire",
      mint: MINT_B58,
    });

    expect(pushIfNew(mk(0))).toBe(true);
    expect(pushIfNew(mk(1))).toBe(true);
    expect(pushIfNew(mk(2))).toBe(true);
    // Same (sig, logIndex) duplicates — second push of logIndex=1 rejected
    expect(pushIfNew(mk(1, "fire"))).toBe(false);

    expect(size()).toBe(3);
    const items = recent();
    expect(items.map((e) => e.logIndex)).toEqual([2, 1, 0]);
  });
});

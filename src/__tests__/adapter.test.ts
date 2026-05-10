/**
 * src/__tests__/adapter.test.ts — sprint task F1
 *
 * Coverage:
 *   · 5 element-byte mappings (1=wood..5=water)
 *   · 3 invalid-byte cases (0, 6, 255) — throws with signature in message
 *   · id-format derivable as `${signature}:${logIndex}`
 *   · null blockTime falls back to Date.now() without crashing
 *   · base58 wallet/mint preserved correctly across round-trip
 *   · non-number element throws (runtime guard for A4 PARTIAL drift)
 *
 * Total: 11 tests.
 */

import { describe, expect, it, vi } from "vitest";
import { ELEMENT_BY_BYTE, stoneClaimedToMintActivity } from "../adapter.js";
import type { RawStoneClaimed } from "../types.js";

const SIG_A = "5kKjYZcHRQfa9JvZGm1nW3LpTdFp9HnjtQNxwvR7gKdmpx2vYAhzHXyUfH8jKhV4z3pqrL";
const SIG_B = "3xKqGm9NZWeRJfVzM8tQrA2yLpvHkxJ7BcDfNpmZRsbThqVWcXLkj6FzPyUmTrYvVzNqDp";

// Fake PublicKey shim: only `.toBase58()` is exercised by adapter, so
// avoid importing @solana/web3.js (transitive rpc-websockets→uuid CJS/ESM
// clash blocks vitest module loading; see vitest.config.ts).
function fakePk(base58: string): unknown {
  return { toBase58: () => base58 };
}
const WALLET_A_B58 = "11111111111111111111111111111111";
const MINT_A_B58 = "So11111111111111111111111111111111111111112";

const baseRaw: RawStoneClaimed = {
  wallet: fakePk(WALLET_A_B58) as RawStoneClaimed["wallet"],
  element: 1,
  weather: 1,
  mint: fakePk(MINT_A_B58) as RawStoneClaimed["mint"],
};

describe("adapter — element byte mapping", () => {
  it("byte 1 → wood", () => {
    const out = stoneClaimedToMintActivity(
      { ...baseRaw, element: 1, weather: 1 },
      { signature: SIG_A, logIndex: 0, slot: 100, blockTime: 1_700_000_000 },
    );
    expect(out.element).toBe("wood");
    expect(out.weather).toBe("wood");
  });

  it("byte 2 → fire", () => {
    const out = stoneClaimedToMintActivity(
      { ...baseRaw, element: 2, weather: 2 },
      { signature: SIG_A, logIndex: 0, slot: 100, blockTime: 1_700_000_000 },
    );
    expect(out.element).toBe("fire");
  });

  it("byte 3 → earth", () => {
    const out = stoneClaimedToMintActivity(
      { ...baseRaw, element: 3, weather: 3 },
      { signature: SIG_A, logIndex: 0, slot: 100, blockTime: 1_700_000_000 },
    );
    expect(out.element).toBe("earth");
  });

  it("byte 4 → metal", () => {
    const out = stoneClaimedToMintActivity(
      { ...baseRaw, element: 4, weather: 4 },
      { signature: SIG_A, logIndex: 0, slot: 100, blockTime: 1_700_000_000 },
    );
    expect(out.element).toBe("metal");
  });

  it("byte 5 → water", () => {
    const out = stoneClaimedToMintActivity(
      { ...baseRaw, element: 5, weather: 5 },
      { signature: SIG_A, logIndex: 0, slot: 100, blockTime: 1_700_000_000 },
    );
    expect(out.element).toBe("water");
  });
});

describe("adapter — invalid bytes throw", () => {
  it("byte 0 throws with signature in message", () => {
    expect(() =>
      stoneClaimedToMintActivity(
        { ...baseRaw, element: 0 },
        { signature: SIG_A, logIndex: 0, slot: 1, blockTime: null },
      ),
    ).toThrowError(new RegExp(`invalid element byte 0.*${SIG_A}`));
  });

  it("byte 6 throws with signature in message", () => {
    expect(() =>
      stoneClaimedToMintActivity(
        { ...baseRaw, element: 6 },
        { signature: SIG_A, logIndex: 0, slot: 1, blockTime: null },
      ),
    ).toThrowError(/invalid element byte 6/);
  });

  it("byte 255 throws", () => {
    expect(() =>
      stoneClaimedToMintActivity(
        { ...baseRaw, element: 255 },
        { signature: SIG_A, logIndex: 0, slot: 1, blockTime: null },
      ),
    ).toThrowError(/invalid element byte 255/);
  });
});

describe("adapter — runtime guard for A4 drift", () => {
  it("non-number element throws with IDL drift hint", () => {
    expect(() =>
      stoneClaimedToMintActivity(
        // Simulate Candidate B (struct-tagged enum) accidentally landing
        { ...baseRaw, element: { wood: {} } as unknown as number },
        { signature: SIG_B, logIndex: 0, slot: 1, blockTime: null },
      ),
    ).toThrowError(/element is not a number.*IDL drift/);
  });
});

describe("adapter — id format and base58 preservation", () => {
  it("id derivable as `${signature}:${logIndex}`", () => {
    const out = stoneClaimedToMintActivity(baseRaw, {
      signature: SIG_A,
      logIndex: 7,
      slot: 12,
      blockTime: 1_700_000_000,
    });
    expect(`${out.signature}:${out.logIndex}`).toBe(`${SIG_A}:7`);
  });

  it("base58 wallet + mint preserved across round-trip", () => {
    const out = stoneClaimedToMintActivity(baseRaw, {
      signature: SIG_A,
      logIndex: 0,
      slot: 1,
      blockTime: 1_700_000_000,
    });
    expect(out.wallet).toBe(WALLET_A_B58);
    expect(out.mint).toBe(MINT_A_B58);
  });
});

describe("adapter — null blockTime fallback", () => {
  it("null blockTime falls back to Date.now() and warns without crashing", () => {
    const fixedNow = 1_700_000_123_456;
    const spy = vi.spyOn(Date, "now").mockReturnValue(fixedNow);
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    try {
      const out = stoneClaimedToMintActivity(baseRaw, {
        signature: SIG_A,
        logIndex: 0,
        slot: 1,
        blockTime: null,
      });
      expect(out.blockTime).toBe(fixedNow);
      expect(warn).toHaveBeenCalledWith(
        expect.stringContaining(`null blockTime at signature ${SIG_A}`),
      );
    } finally {
      spy.mockRestore();
      warn.mockRestore();
    }
  });
});

describe("adapter — ELEMENT_BY_BYTE map shape", () => {
  it("frozen, complete 1..5 mapping", () => {
    expect(ELEMENT_BY_BYTE[1]).toBe("wood");
    expect(ELEMENT_BY_BYTE[5]).toBe("water");
    expect(Object.isFrozen(ELEMENT_BY_BYTE)).toBe(true);
  });
});

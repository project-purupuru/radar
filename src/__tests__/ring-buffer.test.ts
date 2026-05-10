/**
 * src/__tests__/ring-buffer.test.ts — sprint task F2
 *
 * Coverage:
 *   1. push once → recent returns it
 *   2. push same id twice → second returns false, no duplicate emit
 *   3. push past 200 → oldest evicted, seen.size === buffer.length === 200
 *   4. subscriber receives each event exactly once
 *   5. throwing subscriber doesn't poison others
 *   6. multiple subscribers all notified
 *   7. unsubscribe stops delivery
 *
 * Total: 7 tests (closes review M2 via test #3).
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { BUFFER_SIZE, _resetForTests, pushIfNew, recent, size, subscribe } from "../ring-buffer.js";
import type { Element, MintActivity } from "../types.js";

function fakeEvent(idx: number, sig = "sigA"): MintActivity {
  return {
    signature: sig,
    logIndex: idx,
    slot: 100 + idx,
    blockTime: 1_700_000_000 + idx,
    wallet: "11111111111111111111111111111111",
    element: "wood" as Element,
    weather: "fire" as Element,
    mint: "So11111111111111111111111111111111111111112",
  };
}

beforeEach(() => {
  _resetForTests();
});

afterEach(() => {
  _resetForTests();
});

describe("ring-buffer — push semantics", () => {
  it("push once → recent returns it", () => {
    expect(pushIfNew(fakeEvent(0))).toBe(true);
    expect(recent()).toHaveLength(1);
    expect(recent()[0]?.logIndex).toBe(0);
  });

  it("push same id twice → second returns false, single subscriber emit", () => {
    const cb = vi.fn();
    subscribe(cb);
    expect(pushIfNew(fakeEvent(0))).toBe(true);
    expect(pushIfNew(fakeEvent(0))).toBe(false);
    expect(recent()).toHaveLength(1);
    expect(cb).toHaveBeenCalledTimes(1);
  });
});

describe("ring-buffer — eviction invariants (closes review M2)", () => {
  it("push past BUFFER_SIZE → oldest evicted; seen.size === buffer.length === 200", () => {
    for (let i = 0; i < BUFFER_SIZE + 5; i++) pushIfNew(fakeEvent(i));
    expect(size()).toBe(BUFFER_SIZE);
    expect(recent().length).toBe(BUFFER_SIZE);
    // The oldest 5 should have been evicted; the very first event (logIndex=0)
    // is gone, so re-pushing it should succeed (seen.delete on eviction).
    expect(pushIfNew(fakeEvent(0))).toBe(true);
    expect(size()).toBe(BUFFER_SIZE);
  });
});

describe("ring-buffer — subscriber semantics", () => {
  it("subscriber receives each event exactly once; multiple subscribers all notified", () => {
    const cbA = vi.fn();
    const cbB = vi.fn();
    subscribe(cbA);
    subscribe(cbB);
    pushIfNew(fakeEvent(0));
    pushIfNew(fakeEvent(1));
    expect(cbA).toHaveBeenCalledTimes(2);
    expect(cbB).toHaveBeenCalledTimes(2);
  });

  it("throwing subscriber doesn't poison others", () => {
    const cbBad = vi.fn().mockImplementation(() => {
      throw new Error("boom");
    });
    const cbGood = vi.fn();
    const errSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    subscribe(cbBad);
    subscribe(cbGood);
    try {
      pushIfNew(fakeEvent(0));
      expect(cbBad).toHaveBeenCalledTimes(1);
      expect(cbGood).toHaveBeenCalledTimes(1);
      expect(errSpy).toHaveBeenCalled();
    } finally {
      errSpy.mockRestore();
    }
  });

  it("unsubscribe stops delivery", () => {
    const cb = vi.fn();
    const off = subscribe(cb);
    pushIfNew(fakeEvent(0));
    off();
    pushIfNew(fakeEvent(1));
    expect(cb).toHaveBeenCalledTimes(1);
  });
});

describe("ring-buffer — recent newest-first + clamp", () => {
  it("recent(N) returns newest-first, clamped to buffer", () => {
    pushIfNew(fakeEvent(0));
    pushIfNew(fakeEvent(1));
    pushIfNew(fakeEvent(2));
    const top = recent(2);
    expect(top.map((e) => e.logIndex)).toEqual([2, 1]);

    const tooMany = recent(500);
    expect(tooMany.length).toBeLessThanOrEqual(BUFFER_SIZE);
  });
});

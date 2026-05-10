/**
 * src/__tests__/reconnect.test.ts — sprint task F3 (integration, vitest fake timers)
 *
 * Coverage:
 *   1. Liveness loop resets dead-man timer on slot advance
 *   2. 60s without slot advance triggers tear-down + reconnect
 *   3. Backoff sequence walks 1→2→4→8→16→30→30s as expected
 *   4. Cancel signal interrupts in-flight backoff
 *   5. Post-reconnect re-subscribes via subscribeToLogs (closes H3)
 *
 * Total: 5 tests.
 *
 * The reconnect module is intentionally written with injection seams so
 * the integration test never touches a real Solana RPC. We pass a fake
 * `getSlot`, `createConnection`, `subscribeToLogs`, and `sleep` — each
 * deterministic and observable.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Stub out ../client.js BEFORE importing reconnect (which transitively
// pulls in @solana/web3.js → rpc-websockets CJS/uuid v14 ESM clash).
vi.mock("../client.js", () => ({
  createConnection: vi.fn(),
  disconnect: vi.fn(async () => {}),
  subscribeToLogs: vi.fn(async () => ({
    subscriptionId: 0,
    programId: { toBase58: () => "stub" },
  })),
  getProgramId: vi.fn(),
}));

import type { LogsSubscription } from "../client.js";
import * as health from "../health.js";
import { startLivenessLoop } from "../reconnect.js";

// Avoid `@solana/web3.js` + `@coral-xyz/anchor` direct imports here (CJS/ESM
// transitive issues in vitest). Cast lazily — reconnect.ts treats Connection
// + PublicKey as opaque types except via the injection seams.
type Connection = unknown;
type Idl = unknown;
type PublicKey = { toBase58: () => string };

const PROGRAM_ID = { toBase58: () => "11111111111111111111111111111111" } as PublicKey;
const FAKE_IDL = {
  address: PROGRAM_ID.toBase58(),
  instructions: [],
  accounts: [],
  events: [],
  errors: [],
  types: [],
  metadata: { name: "fake", version: "0", spec: "0", description: "" },
};

function makeFakeConn(): Connection {
  return { _id: Math.random() };
}

function makeFakeSub(programId: PublicKey = PROGRAM_ID): LogsSubscription {
  return { subscriptionId: 1, programId } as unknown as LogsSubscription;
}

beforeEach(() => {
  health._resetForTests();
});

afterEach(() => {
  vi.restoreAllMocks();
});

interface SleepCall {
  ms: number;
  resolve: () => void;
  signal: { cancelled: boolean };
}

function makeControlledSleep() {
  const calls: SleepCall[] = [];
  const sleep = (ms: number, signal: { cancelled: boolean }): Promise<void> => {
    return new Promise<void>((resolve) => {
      calls.push({ ms, resolve, signal });
    });
  };
  const release = (n = 1) => {
    for (let i = 0; i < n; i++) {
      const next = calls.shift();
      if (next) next.resolve();
    }
  };
  const releaseAll = () => {
    while (calls.length > 0) {
      const next = calls.shift();
      if (next) next.resolve();
    }
  };
  return { calls, sleep, release, releaseAll };
}

async function flush() {
  for (let i = 0; i < 8; i++) await Promise.resolve();
}

describe("reconnect — heartbeat resets dead-man on slot advance", () => {
  it("monotonically advancing slot keeps connection alive (no reconnect)", async () => {
    const { calls, sleep, release } = makeControlledSleep();
    let slot = 100;
    const getSlot = vi.fn(async () => slot);
    const subscribeToLogs = vi.fn(async (_c: Connection) => makeFakeSub());
    const createConnection = vi.fn(makeFakeConn);

    const handle = startLivenessLoop({
      initialConnection: makeFakeConn() as never,
      initialSubscription: makeFakeSub(),
      idl: FAKE_IDL as never,
      sleep,
      getSlot: getSlot as never,
      createConnection: createConnection as never,
      subscribeToLogs: subscribeToLogs as never,
      heartbeatIntervalMs: 100,
      deadManThresholdMs: 1000,
    });

    await flush();
    expect(getSlot).toHaveBeenCalledTimes(1);
    expect(calls.length).toBeGreaterThan(0);

    // Advance the slot before each heartbeat fires
    for (let i = 0; i < 3; i++) {
      slot += 1;
      release();
      await flush();
    }
    handle.stop();
    release();
    await flush();

    expect(createConnection).not.toHaveBeenCalled();
    expect(subscribeToLogs).not.toHaveBeenCalled();
  });
});

describe("reconnect — dead-man triggers reconnect after threshold", () => {
  it("60s without slot advance triggers disconnect + re-subscribe", async () => {
    const { sleep, releaseAll } = makeControlledSleep();
    const STALL_SLOT = 500;
    const getSlot = vi.fn(async () => STALL_SLOT);
    const newConn = makeFakeConn();
    const newSub = makeFakeSub();
    const subscribeToLogs = vi.fn(async (_c: Connection) => newSub);
    const createConnection = vi.fn(() => newConn);

    const realDateNow = Date.now;
    let now = 1_700_000_000_000;
    vi.spyOn(Date, "now").mockImplementation(() => now);

    const handle = startLivenessLoop({
      initialConnection: makeFakeConn() as never,
      initialSubscription: makeFakeSub(),
      idl: FAKE_IDL as never,
      sleep,
      getSlot: getSlot as never,
      createConnection: createConnection as never,
      subscribeToLogs: subscribeToLogs as never,
      heartbeatIntervalMs: 100,
      deadManThresholdMs: 1000,
    });

    // Walk the loop until reconnect fires; slot stays stalled so dead-man trips.
    await flush();
    for (let i = 0; i < 30 && createConnection.mock.calls.length === 0; i++) {
      now += 250;
      releaseAll();
      await flush();
    }

    expect(createConnection).toHaveBeenCalled();
    expect(subscribeToLogs).toHaveBeenCalled();
    expect(handle.getConnection()).toBe(newConn);
    expect(handle.getSubscription()).toBe(newSub);

    handle.stop();
    releaseAll();
    Date.now = realDateNow;
  });
});

describe("reconnect — backoff sequence walks 1→2→4→8→16→30s", () => {
  it("each consecutive reconnect uses next-larger backoff, capping at 30s", async () => {
    const sleeps: number[] = [];
    const heartbeatMs = 50;
    const sleep = (ms: number) => {
      sleeps.push(ms);
      return Promise.resolve();
    };

    const slot = 0;
    const getSlot = vi.fn(async () => slot);
    const subscribeToLogs = vi.fn(async (_c: Connection) => makeFakeSub());
    const createConnection = vi.fn(makeFakeConn);

    const realDateNow = Date.now;
    let now = 0;
    vi.spyOn(Date, "now").mockImplementation(() => now);

    const handle = startLivenessLoop({
      initialConnection: makeFakeConn() as never,
      initialSubscription: makeFakeSub(),
      idl: FAKE_IDL as never,
      sleep,
      getSlot: getSlot as never,
      createConnection: createConnection as never,
      subscribeToLogs: subscribeToLogs as never,
      heartbeatIntervalMs: heartbeatMs,
      deadManThresholdMs: 1,
    });

    // Pump enough loop iterations to walk through the backoff schedule.
    for (let i = 0; i < 100; i++) {
      now += 10;
      await flush();
      if (subscribeToLogs.mock.calls.length >= 7) break;
    }

    handle.stop();
    Date.now = realDateNow;

    // Filter to backoff waits (not heartbeat sleeps); backoff values are
    // those that match BACKOFF_MS schedule.
    const backoffWaits = sleeps.filter((ms) => [1000, 2000, 4000, 8000, 16000, 30000].includes(ms));
    const expected = [1000, 2000, 4000, 8000, 16000, 30000, 30000];
    expect(backoffWaits.slice(0, expected.length)).toEqual(expected);
  });
});

describe("reconnect — cancel signal interrupts backoff", () => {
  it("stop() flips signal.cancelled and prevents further reconnects", async () => {
    const seenSignals: { cancelled: boolean }[] = [];
    const sleep = (_ms: number, signal: { cancelled: boolean }) => {
      seenSignals.push(signal);
      return new Promise<void>((resolve) => setTimeout(resolve, 0));
    };
    const getSlot = vi.fn(async () => {
      throw new Error("rpc dead");
    });
    const subscribeToLogs = vi.fn(async (_c: Connection) => makeFakeSub());
    const createConnection = vi.fn(makeFakeConn);

    const handle = startLivenessLoop({
      initialConnection: makeFakeConn() as never,
      initialSubscription: makeFakeSub(),
      idl: FAKE_IDL as never,
      sleep,
      getSlot: getSlot as never,
      createConnection: createConnection as never,
      subscribeToLogs: subscribeToLogs as never,
      heartbeatIntervalMs: 5,
      deadManThresholdMs: 1,
    });

    await flush();
    handle.stop();
    await flush();

    expect(seenSignals.length).toBeGreaterThan(0);
    for (const s of seenSignals) expect(s.cancelled).toBe(true);
  });
});

describe("reconnect — explicit re-subscribe after Connection recreation (closes H3)", () => {
  it("post-reconnect: BOTH createConnection AND subscribeToLogs are called", async () => {
    const { sleep, releaseAll } = makeControlledSleep();
    const getSlot = vi.fn(async () => 1);
    const subscribeToLogs = vi.fn(async (_c: Connection) => makeFakeSub());
    const createConnection = vi.fn(makeFakeConn);

    const realDateNow = Date.now;
    let now = 1_700_000_000_000;
    vi.spyOn(Date, "now").mockImplementation(() => now);

    const handle = startLivenessLoop({
      initialConnection: makeFakeConn() as never,
      initialSubscription: makeFakeSub(),
      idl: FAKE_IDL as never,
      sleep,
      getSlot: getSlot as never,
      createConnection: createConnection as never,
      subscribeToLogs: subscribeToLogs as never,
      heartbeatIntervalMs: 100,
      deadManThresholdMs: 1000,
    });

    await flush();
    for (let i = 0; i < 6; i++) {
      now += 250;
      releaseAll();
      await flush();
    }

    expect(createConnection).toHaveBeenCalled();
    expect(subscribeToLogs).toHaveBeenCalled();
    expect(subscribeToLogs.mock.calls.length).toBeGreaterThanOrEqual(
      createConnection.mock.calls.length,
    );

    handle.stop();
    releaseAll();
    Date.now = realDateNow;
  });
});

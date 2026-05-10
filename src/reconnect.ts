/**
 * src/reconnect.ts — liveness loop with bounded backoff (sprint B6)
 *
 * Per SDD §6:
 *   - 20s `getSlot` heartbeat
 *   - 60s dead-man threshold (no slot advance → tear down + reconnect)
 *   - bounded backoff [1, 2, 4, 8, 16, 30, 30, ...] seconds
 *   - cancellable via `stopLivenessLoop()`
 *   - re-creates Connection AND explicitly re-calls `subscribeToLogs`
 *     (review finding H3: Connection recreation alone does NOT
 *     auto-resubscribe)
 *
 * Note: `getSlot` failure is treated the same as a stalled slot — both
 * indicate the RPC is unhealthy and a reconnect is warranted.
 */

import type { Idl } from "@coral-xyz/anchor";
import type { Connection } from "@solana/web3.js";
import { type LogsSubscription, createConnection, disconnect, subscribeToLogs } from "./client.js";
import * as health from "./health.js";

const HEARTBEAT_INTERVAL_MS = 20_000;
const DEAD_MAN_THRESHOLD_MS = 60_000;
const BACKOFF_MS = [1_000, 2_000, 4_000, 8_000, 16_000, 30_000];

export interface LivenessHandle {
  stop: () => void;
  /** Currently-active connection. Re-bound across reconnects. */
  getConnection: () => Connection;
  /** Currently-active subscription. Re-bound across reconnects. */
  getSubscription: () => LogsSubscription;
}

interface InternalState {
  cancelled: boolean;
  connection: Connection;
  subscription: LogsSubscription;
  lastSeenSlot: number | null;
  lastSlotAt: number | null;
  backoffIndex: number;
  cancelSignal: { cancelled: boolean };
}

function backoffFor(idx: number): number {
  const last = BACKOFF_MS[BACKOFF_MS.length - 1] ?? 30_000;
  return BACKOFF_MS[Math.min(idx, BACKOFF_MS.length - 1)] ?? last;
}

export interface SleepDeps {
  setTimeout?: typeof setTimeout;
  clearTimeout?: typeof clearTimeout;
}

function makeSleep(deps: SleepDeps = {}) {
  const set = deps.setTimeout ?? setTimeout;
  const clr = deps.clearTimeout ?? clearTimeout;
  return (ms: number, signal: { cancelled: boolean }) =>
    new Promise<void>((resolve) => {
      const t = set(() => resolve(), ms);
      const tick = set(
        () => {
          if (signal.cancelled) {
            clr(t);
            resolve();
          }
        },
        Math.min(ms, 50),
      );
      void tick;
    });
}

export interface StartLivenessLoopParams {
  initialConnection: Connection;
  initialSubscription: LogsSubscription;
  idl: Idl;
  /** Injection seam for tests. */
  sleep?: (ms: number, signal: { cancelled: boolean }) => Promise<void>;
  /** Injection seam for tests — replace with a fake getSlot. */
  getSlot?: (conn: Connection) => Promise<number>;
  /** Injection seam for tests — replace Connection factory. */
  createConnection?: () => Connection;
  /** Injection seam for tests — replace subscribeToLogs. */
  subscribeToLogs?: (conn: Connection) => Promise<LogsSubscription>;
  heartbeatIntervalMs?: number;
  deadManThresholdMs?: number;
}

export function startLivenessLoop(params: StartLivenessLoopParams): LivenessHandle {
  const sleep = params.sleep ?? makeSleep();
  const realGetSlot = params.getSlot ?? ((conn: Connection) => conn.getSlot("confirmed"));
  const realCreateConn = params.createConnection ?? createConnection;
  const realSubscribe =
    params.subscribeToLogs ??
    ((conn: Connection) => subscribeToLogs(conn, params.initialSubscription.programId, params.idl));
  const heartbeatMs = params.heartbeatIntervalMs ?? HEARTBEAT_INTERVAL_MS;
  const deadManMs = params.deadManThresholdMs ?? DEAD_MAN_THRESHOLD_MS;

  const state: InternalState = {
    cancelled: false,
    connection: params.initialConnection,
    subscription: params.initialSubscription,
    lastSeenSlot: null,
    lastSlotAt: Date.now(),
    backoffIndex: 0,
    cancelSignal: { cancelled: false },
  };

  async function triggerReconnect(): Promise<void> {
    health.setConnected(false);
    try {
      await disconnect(state.connection, state.subscription);
    } catch (err) {
      console.warn(
        `[reconnect] disconnect threw (subscription likely dead): ${(err as Error).message}`,
      );
    }
    const wait = backoffFor(state.backoffIndex);
    state.backoffIndex += 1;
    await sleep(wait, state.cancelSignal);
    if (state.cancelled) return;

    const newConn = realCreateConn();
    const newSub = await realSubscribe(newConn);
    state.connection = newConn;
    state.subscription = newSub;
    state.lastSlotAt = Date.now();
    // NOTE: don't clear lastSeenSlot — if we did, the next heartbeat would
    // treat the same-slot RPC response as "advancing" and reset
    // backoffIndex, defeating the bounded-backoff schedule. Keep the
    // observed slot; the dead-man timer is what matters for liveness.
    health.setConnected(true);
  }

  async function loop(): Promise<void> {
    while (!state.cancelled) {
      try {
        const slot = await realGetSlot(state.connection);
        if (slot !== state.lastSeenSlot) {
          state.lastSeenSlot = slot;
          state.lastSlotAt = Date.now();
          state.backoffIndex = 0;
          health.setConnected(true);
        } else if (state.lastSlotAt != null && Date.now() - state.lastSlotAt > deadManMs) {
          await triggerReconnect();
        }
      } catch (err) {
        console.warn(`[reconnect] heartbeat threw: ${(err as Error).message}`);
        await triggerReconnect();
      }
      if (state.cancelled) break;
      await sleep(heartbeatMs, state.cancelSignal);
    }
  }

  void loop();

  return {
    stop: () => {
      state.cancelled = true;
      state.cancelSignal.cancelled = true;
    },
    getConnection: () => state.connection,
    getSubscription: () => state.subscription,
  };
}

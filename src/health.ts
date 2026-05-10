/**
 * src/health.ts — module-singleton health state for /health (sprint B4)
 *
 * Owned mutable state read by the HTTP server. Setters called only by
 * boot (`src/index.ts`), the indexer client (`src/client.ts`), and the
 * reconnect loop (`src/reconnect.ts`). External consumers read-only via
 * `getIndexerHealth()`.
 */

import type { IndexerHealth } from "./types.js";

const VERSION = process.env.npm_package_version ?? process.env.RADAR_VERSION ?? "0.1.0";

interface MutableHealthState {
  indexerStarted: boolean;
  lastEventAt: string | null;
  count: number;
  connected: boolean;
  mode: "live" | "warmup";
  dbConnected: boolean | null;
}

const state: MutableHealthState = {
  indexerStarted: false,
  lastEventAt: null,
  count: 0,
  connected: false,
  mode: "warmup",
  dbConnected: null,
};

function deriveStatus(): IndexerHealth["status"] {
  if (!state.indexerStarted) return "starting";
  if (!state.connected) return "degraded";
  return "ok";
}

export function getIndexerHealth(): IndexerHealth {
  return {
    status: deriveStatus(),
    service: "radar",
    version: VERSION,
    indexerStarted: state.indexerStarted,
    lastEventAt: state.lastEventAt,
    count: state.count,
    connected: state.connected,
    mode: state.mode,
    dbConnected: state.dbConnected,
  };
}

export function setIndexerStarted(started: boolean): void {
  state.indexerStarted = started;
}

export function setConnected(connected: boolean): void {
  state.connected = connected;
}

export function setMode(mode: "live" | "warmup"): void {
  state.mode = mode;
}

/**
 * Set DB connection status. `null` means DB is disabled (DATABASE_URL
 * unset); `true`/`false` reflect last-known operational state.
 */
export function setDbConnected(connected: boolean | null): void {
  state.dbConnected = connected;
}

export function recordEvent(at: Date = new Date()): void {
  state.count += 1;
  state.lastEventAt = at.toISOString();
}

export function _resetForTests(): void {
  state.indexerStarted = false;
  state.lastEventAt = null;
  state.count = 0;
  state.connected = false;
  state.mode = "warmup";
  state.dbConnected = null;
}

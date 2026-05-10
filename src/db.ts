/**
 * src/db.ts — optional Postgres backup for mid-flight resilience (DB-1)
 *
 * SCOPE AMENDMENT 2026-05-10: PRD §6 D-1 (persistence layer) was originally
 * post-hackathon. Pulled forward by zerker for demo-day insurance against
 * mid-flight radar restarts (Helius env-flag swap, Railway redeploy, etc.).
 *
 * Design contract:
 *   - DATABASE_URL absent → all functions are no-ops; behavior identical
 *     to ring-buffer-only mode. Local `pnpm dev` keeps working without a
 *     Postgres setup.
 *   - DB is BACKUP storage. `/events/recent` always reads from the ring
 *     buffer; DB exists purely to hydrate the buffer at boot after a restart.
 *   - Writes are fire-and-forget — DB latency or failure never blocks event
 *     ingestion. health.dbConnected reflects last-known DB state.
 *   - Schema bootstrap is `CREATE TABLE IF NOT EXISTS` at init; no migration
 *     framework. Single table mirroring MintActivity.
 */

import pg from "pg";
import * as health from "./health.js";
import type { Element, MintActivity } from "./types.js";

const VALID_ELEMENTS: ReadonlySet<Element> = new Set(["wood", "fire", "earth", "metal", "water"]);

let pool: pg.Pool | null = null;

const SCHEMA_SQL = `
  CREATE TABLE IF NOT EXISTS mint_activity (
    signature    TEXT    NOT NULL,
    log_index    INTEGER NOT NULL,
    slot         BIGINT  NOT NULL,
    block_time   BIGINT  NOT NULL,
    wallet       TEXT    NOT NULL,
    element      TEXT    NOT NULL CHECK (element IN ('wood','fire','earth','metal','water')),
    weather      TEXT    NOT NULL CHECK (weather IN ('wood','fire','earth','metal','water')),
    mint         TEXT    NOT NULL,
    inserted_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (signature, log_index)
  );
  CREATE INDEX IF NOT EXISTS mint_activity_block_time_idx
    ON mint_activity (block_time DESC);
`;

/**
 * Initialize the DB connection pool and ensure schema. Returns true if
 * the DB is usable; false otherwise (DATABASE_URL absent OR connection
 * failed). Caller logs + continues either way; radar is functional
 * without DB.
 */
export async function initDb(): Promise<boolean> {
  const url = process.env.DATABASE_URL;
  if (!url) {
    console.log("[db] DATABASE_URL not set — running ring-buffer-only");
    health.setDbConnected(false);
    return false;
  }

  try {
    pool = new pg.Pool({
      connectionString: url,
      max: 5,
      idleTimeoutMillis: 30_000,
      connectionTimeoutMillis: 10_000,
      ssl: shouldUseSsl(url) ? { rejectUnauthorized: false } : undefined,
    });
    pool.on("error", (err) => {
      console.error("[db] pool emitted error:", err.message);
      health.setDbConnected(false);
    });
    await pool.query(SCHEMA_SQL);
    health.setDbConnected(true);
    console.log("[db] connected and schema ensured");
    return true;
  } catch (err) {
    console.error(`[db] init failed: ${(err as Error).message}`);
    pool = null;
    health.setDbConnected(false);
    return false;
  }
}

function shouldUseSsl(url: string): boolean {
  // Railway-managed Postgres requires TLS. Allow opt-out via
  // DATABASE_SSL=disable for local-machine smoke tests.
  if (process.env.DATABASE_SSL === "disable") return false;
  if (process.env.DATABASE_SSL === "require") return true;
  // Heuristic: Railway internal URLs use postgres.railway.internal; external
  // URLs use *.proxy.rlwy.net or similar. Default to TLS-on for any
  // non-localhost host.
  try {
    const u = new URL(url);
    if (u.hostname === "localhost" || u.hostname === "127.0.0.1") return false;
    return true;
  } catch {
    return true;
  }
}

/**
 * Insert one MintActivity. Idempotent on (signature, log_index) via
 * primary key + ON CONFLICT DO NOTHING. Fire-and-forget — caller does not
 * await the result.
 */
export async function insertActivity(a: MintActivity): Promise<void> {
  if (!pool) return;
  try {
    await pool.query(
      `INSERT INTO mint_activity
         (signature, log_index, slot, block_time, wallet, element, weather, mint)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       ON CONFLICT (signature, log_index) DO NOTHING`,
      [a.signature, a.logIndex, a.slot, a.blockTime, a.wallet, a.element, a.weather, a.mint],
    );
    health.setDbConnected(true);
  } catch (err) {
    console.error(
      `[db] insertActivity failed for ${a.signature}:${a.logIndex}: ${(err as Error).message}`,
    );
    health.setDbConnected(false);
  }
}

/**
 * Load the last N events from DB, newest-first. Returns [] if DB
 * unavailable or query fails. Used by boot-warmup to hydrate the ring
 * buffer after a restart.
 */
export async function loadRecentFromDb(limit = 200): Promise<MintActivity[]> {
  if (!pool) return [];
  try {
    const result = await pool.query<{
      signature: string;
      log_index: number;
      slot: string;
      block_time: string;
      wallet: string;
      element: string;
      weather: string;
      mint: string;
    }>(
      `SELECT signature, log_index, slot, block_time, wallet, element, weather, mint
       FROM mint_activity
       ORDER BY block_time DESC, log_index DESC
       LIMIT $1`,
      [limit],
    );
    health.setDbConnected(true);
    return result.rows.map((r) => coerceRow(r)).filter((a): a is MintActivity => a !== null);
  } catch (err) {
    console.error(`[db] loadRecentFromDb failed: ${(err as Error).message}`);
    health.setDbConnected(false);
    return [];
  }
}

function coerceRow(r: {
  signature: string;
  log_index: number;
  slot: string;
  block_time: string;
  wallet: string;
  element: string;
  weather: string;
  mint: string;
}): MintActivity | null {
  if (!VALID_ELEMENTS.has(r.element as Element) || !VALID_ELEMENTS.has(r.weather as Element)) {
    console.warn(
      `[db] dropping row with invalid element/weather (${r.element}/${r.weather}) sig ${r.signature}`,
    );
    return null;
  }
  return {
    signature: r.signature,
    logIndex: r.log_index,
    slot: Number(r.slot),
    blockTime: Number(r.block_time),
    wallet: r.wallet,
    element: r.element as Element,
    weather: r.weather as Element,
    mint: r.mint,
  };
}

export async function shutdownDb(): Promise<void> {
  if (!pool) return;
  try {
    await pool.end();
  } catch (err) {
    console.warn(`[db] shutdown threw: ${(err as Error).message}`);
  }
  pool = null;
}

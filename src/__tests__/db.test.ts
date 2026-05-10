/**
 * src/__tests__/db.test.ts — DB-1 unit tests
 *
 * Coverage (without spinning up a real Postgres):
 *   1. initDb() with no DATABASE_URL returns false, sets dbConnected=null
 *   2. insertActivity() with no DB initialized is a no-op (no throw)
 *   3. loadRecentFromDb() with no DB initialized returns []
 *   4. shutdownDb() with no pool is a no-op (no throw)
 *
 * Total: 4 tests. Live-DB integration is verified at G1 deploy time
 * via /health.dbConnected on Railway.
 */

import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { initDb, insertActivity, loadRecentFromDb, shutdownDb } from "../db.js";
import * as health from "../health.js";
import type { MintActivity } from "../types.js";

const sampleActivity: MintActivity = {
  signature: "sigA",
  logIndex: 0,
  slot: 100,
  blockTime: 1_700_000_000,
  wallet: "11111111111111111111111111111111",
  element: "wood",
  weather: "fire",
  mint: "So11111111111111111111111111111111111111112",
};

const ORIGINAL_DATABASE_URL = process.env.DATABASE_URL;

beforeEach(() => {
  health._resetForTests();
  process.env.DATABASE_URL = "";
});

afterEach(async () => {
  await shutdownDb();
  process.env.DATABASE_URL = ORIGINAL_DATABASE_URL ?? "";
});

describe("db — DATABASE_URL absent → no-op mode", () => {
  it("initDb returns false and sets dbConnected=false", async () => {
    process.env.DATABASE_URL = "";
    const ok = await initDb();
    expect(ok).toBe(false);
    expect(health.getIndexerHealth().dbConnected).toBe(false);
  });

  it("insertActivity is a no-op (no throw) when DB not initialized", async () => {
    process.env.DATABASE_URL = "";
    await expect(insertActivity(sampleActivity)).resolves.toBeUndefined();
  });

  it("loadRecentFromDb returns [] when DB not initialized", async () => {
    process.env.DATABASE_URL = "";
    const rows = await loadRecentFromDb(50);
    expect(rows).toEqual([]);
  });

  it("shutdownDb is a no-op when DB not initialized", async () => {
    await expect(shutdownDb()).resolves.toBeUndefined();
  });
});

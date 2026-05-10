/**
 * src/index.ts — radar entrypoint (sprint C2)
 *
 * Boot sequence per SDD §9:
 *   1. Read env vars
 *   2. Initialize health: { connected: false, count: 0, mode: "warmup" }
 *   3. Start Hono HTTP server FIRST (Railway healthcheck doesn't fail
 *      during ~5s subscription warmup)
 *   4. Start indexer subscription async (Connection → BorshCoder →
 *      EventParser → onLogs)
 *   5. Start liveness loop async (getSlot heartbeat + reconnect)
 *   6. Process stays alive on event loop
 *
 * Graceful shutdown on SIGTERM/SIGINT: stop liveness, disconnect, close
 * server.
 */

import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import type { Idl } from "@coral-xyz/anchor";
import { serve } from "@hono/node-server";
import { createConnection, disconnect, getProgramId, subscribeToLogs } from "./client.js";
import { initDb, loadRecentFromDb, shutdownDb } from "./db.js";
import * as health from "./health.js";
import { startLivenessLoop } from "./reconnect.js";
import { pushIfNew } from "./ring-buffer.js";
import { app } from "./server.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

function loadIdl(): Idl {
  const idlPath = resolve(__dirname, "idl", "purupuru_anchor.json");
  const raw = readFileSync(idlPath, "utf-8");
  return JSON.parse(raw) as Idl;
}

async function bootIndexer() {
  const idl = loadIdl();

  // 1. Optional DB init (DB-1 scope amendment). No-op if DATABASE_URL
  //    unset; ring-buffer-only behavior preserved.
  const dbReady = await initDb();

  // 2. Hydrate ring buffer from DB BEFORE subscribing — survives
  //    radar restarts / Railway redeploys without losing demo events.
  if (dbReady) {
    const historical = await loadRecentFromDb(200);
    // DB rows arrive newest-first; reverse so push order is oldest-first
    // and ring-buffer.recent() returns them in correct chronological order.
    for (const a of historical.reverse()) pushIfNew(a);
    console.log(`[radar] hydrated ring buffer with ${historical.length} historical events from DB`);
  }

  // 3. Subscribe to live logs.
  const connection = createConnection();
  const programId = getProgramId();
  const subscription = await subscribeToLogs(connection, programId, idl);

  health.setIndexerStarted(true);
  health.setConnected(true);
  health.setMode("live");

  const liveness = startLivenessLoop({
    initialConnection: connection,
    initialSubscription: subscription,
    idl,
  });

  return { connection, subscription, liveness, idl };
}

async function main() {
  const port = Number.parseInt(process.env.PORT ?? "3000", 10);

  const server = serve({ fetch: app.fetch, port });
  console.log(`[radar] listening on http://localhost:${port}`);

  let runtime: Awaited<ReturnType<typeof bootIndexer>> | null = null;
  bootIndexer()
    .then((r) => {
      runtime = r;
      console.log(
        `[radar] subscribed to program ${getProgramId().toBase58()} (subscription ${r.subscription.subscriptionId})`,
      );
    })
    .catch((err) => {
      console.error("[radar] indexer boot failed:", err);
      health.setConnected(false);
    });

  const shutdown = async (signal: string) => {
    console.log(`[radar] received ${signal} — shutting down`);
    if (runtime) {
      try {
        runtime.liveness.stop();
        await disconnect(runtime.connection, runtime.subscription);
      } catch (err) {
        console.error("[radar] shutdown error:", err);
      }
    }
    await shutdownDb();
    server.close((err) => {
      if (err) console.error("[radar] server close error:", err);
      process.exit(0);
    });
    setTimeout(() => process.exit(1), 5_000).unref();
  };

  process.on("SIGTERM", () => void shutdown("SIGTERM"));
  process.on("SIGINT", () => void shutdown("SIGINT"));
}

void main();

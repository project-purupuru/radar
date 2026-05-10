/**
 * radar — Solana on-chain event indexer entrypoint.
 *
 * Boots HTTP server (Hono) and (eventually) the Solana RPC subscription.
 * Implementation follows the sprint plan at grimoires/loa/sprint.md once
 * /plan generates it. This file currently provides a healthy baseline that
 * proves the build + Railway deploy contract works end-to-end.
 */

import { serve } from "@hono/node-server";
import { Hono } from "hono";

const app = new Hono();

app.get("/", (c) => c.text("radar — listening from the wider sky"));

app.get("/health", (c) =>
  c.json({
    status: "ok",
    service: "radar",
    version: "0.1.0",
    indexerStarted: false,
    note: "indexer subscription not yet wired — see grimoires/loa/sprint.md",
  }),
);

app.get("/events/recent", (c) =>
  c.json({
    events: [],
    note: "indexer subscription not yet wired",
  }),
);

const port = Number(process.env.PORT ?? 3000);
serve({ fetch: app.fetch, port });
console.log(`[radar] listening on http://localhost:${port}`);

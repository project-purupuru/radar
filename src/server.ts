/**
 * src/server.ts — Hono app with 4 read-only routes (sprint C1)
 *
 * Routes:
 *   GET /              — text banner
 *   GET /health        — IndexerHealth snapshot
 *   GET /events/recent — `{ events: MintActivity[] }`, optional ?limit=N
 *   GET /events/count  — `{ count: number }`
 *
 * No business logic — handlers read from health + ring-buffer modules.
 * CORS via env `CORS_ORIGIN` (default `*` for dev).
 */

import { Hono } from "hono";
import { cors } from "hono/cors";
import { getIndexerHealth } from "./health.js";
import { recent, size } from "./ring-buffer.js";

export const app = new Hono();

app.use(
  "*",
  cors({
    origin: process.env.CORS_ORIGIN ?? "*",
    allowMethods: ["GET"],
  }),
);

app.get("/", (c) => c.text("radar — listening from the wider sky"));

app.get("/health", (c) => c.json(getIndexerHealth()));

app.get("/events/recent", (c) => {
  const raw = c.req.query("limit");
  const requested = raw == null ? undefined : Number.parseInt(raw, 10);
  const limit = requested && Number.isFinite(requested) && requested > 0 ? requested : 50;
  return c.json({ events: recent(limit) });
});

app.get("/events/count", (c) => {
  const health = getIndexerHealth();
  return c.json({ count: health.count, bufferSize: size() });
});

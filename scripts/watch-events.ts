/**
 * scripts/watch-events.ts — real-time radar watcher for T-1 dry-run +
 * demo-day morning.
 *
 * Polls `/health` and `/events/recent` every few seconds and prints when:
 *   - new events arrive (`count` increases)
 *   - WS state flips (`connected: true ↔ false`)
 *   - mode flips (warmup ↔ live)
 *   - DB state flips (`dbConnected`)
 *
 * Quiet during steady-state. Loud the moment something changes — exactly
 * what you want when waiting for zksoju's trigger or watching for
 * mid-recording issues.
 *
 * Usage:
 *   pnpm tsx scripts/watch-events.ts
 *   RADAR_URL=https://other.up.railway.app pnpm tsx scripts/watch-events.ts
 *   POLL_INTERVAL_S=5 pnpm tsx scripts/watch-events.ts
 *
 * Ctrl+C to stop.
 */

const URL =
  process.env.RADAR_URL ?? "https://radar-production-8f2f.up.railway.app";
const POLL_INTERVAL_MS = Number.parseInt(process.env.POLL_INTERVAL_S ?? "3", 10) * 1000;

interface IndexerHealth {
  status: string;
  service: string;
  version: string;
  indexerStarted: boolean;
  lastEventAt: string | null;
  count: number;
  connected: boolean;
  mode: string;
  dbConnected: boolean | null;
}

interface MintActivity {
  signature: string;
  logIndex: number;
  slot: number;
  blockTime: number;
  wallet: string;
  element: string;
  weather: string;
  mint: string;
}

let prev: IndexerHealth | null = null;
let lastReportedCount = 0;

function ts(): string {
  return new Date().toISOString().slice(11, 19);
}

function colored(label: string, value: string | number | boolean | null, good: boolean): string {
  const v = value === null ? "null" : String(value);
  const tone = good ? "\x1b[32m" : "\x1b[31m";
  return `${label}=${tone}${v}\x1b[0m`;
}

async function fetchHealth(): Promise<IndexerHealth | null> {
  try {
    const res = await fetch(`${URL}/health`);
    if (!res.ok) {
      console.log(`[${ts()}] ⚠ /health responded ${res.status}`);
      return null;
    }
    return (await res.json()) as IndexerHealth;
  } catch (err) {
    console.log(`[${ts()}] ⚠ /health fetch failed: ${(err as Error).message}`);
    return null;
  }
}

async function fetchRecent(limit: number): Promise<MintActivity[]> {
  try {
    const res = await fetch(`${URL}/events/recent?limit=${limit}`);
    if (!res.ok) return [];
    const body = (await res.json()) as { events: MintActivity[] };
    return body.events ?? [];
  } catch {
    return [];
  }
}

function reportDelta(curr: IndexerHealth, p: IndexerHealth | null): void {
  if (!p) {
    // First sample — print baseline
    console.log(
      `[${ts()}] baseline · ${colored("status", curr.status, curr.status === "ok")} ${colored(
        "connected",
        curr.connected,
        curr.connected,
      )} ${colored("mode", curr.mode, curr.mode === "live")} ${colored(
        "dbConnected",
        curr.dbConnected,
        curr.dbConnected === true,
      )} count=${curr.count}`,
    );
    return;
  }

  const changes: string[] = [];
  if (curr.connected !== p.connected) {
    changes.push(colored("connected", curr.connected, curr.connected));
  }
  if (curr.mode !== p.mode) {
    changes.push(colored("mode", curr.mode, curr.mode === "live"));
  }
  if (curr.dbConnected !== p.dbConnected) {
    changes.push(colored("dbConnected", curr.dbConnected, curr.dbConnected === true));
  }
  if (curr.status !== p.status) {
    changes.push(colored("status", curr.status, curr.status === "ok"));
  }

  if (changes.length > 0) {
    console.log(`[${ts()}] STATE CHANGE · ${changes.join(" · ")}`);
  }
}

async function poll(): Promise<void> {
  const curr = await fetchHealth();
  if (!curr) return;

  reportDelta(curr, prev);
  prev = curr;

  if (curr.count > lastReportedCount) {
    const delta = curr.count - lastReportedCount;
    const recent = await fetchRecent(Math.min(delta, 10));
    console.log("");
    console.log(
      `\x1b[33m[${ts()}] 🎯 ${delta} NEW EVENT${delta > 1 ? "S" : ""} · total count=${curr.count}\x1b[0m`,
    );
    for (const e of recent.slice(0, delta).reverse()) {
      const blockTimeStr = new Date(e.blockTime).toISOString().slice(11, 19);
      console.log(
        `      · sig=${e.signature.slice(0, 12)}… · slot=${e.slot} · blockTime=${blockTimeStr} · ${e.element}/${e.weather} · wallet=${e.wallet.slice(0, 8)}… · mint=${e.mint.slice(0, 8)}…`,
      );
    }
    console.log("");
    lastReportedCount = curr.count;
  }
}

console.log(`[${ts()}] watching ${URL}/health every ${POLL_INTERVAL_MS / 1000}s · Ctrl+C to stop`);
console.log("");

void poll();
setInterval(() => void poll(), POLL_INTERVAL_MS);

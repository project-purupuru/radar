/**
 * scripts/probe-onlogs.ts — diagnostic: prove devnet WS subscription
 * delivers `onLogs` callbacks on real on-chain activity.
 *
 * Subscribes (via `connection.onLogs(programId, …)`) to a high-traffic
 * devnet program (default: SPL Token Program), prints every callback
 * for a fixed window, then disconnects. Same SDK + RPC code path radar
 * uses on Railway — if this works locally, the radar deploy's
 * subscription will deliver our `StoneClaimed` event when zksoju fires it.
 *
 * Pre-T-1 sanity check: validates the WS pipeline end-to-end without
 * waiting for our specific program to emit. Does NOT validate the IDL
 * parser shape (still A4 PARTIAL) — it only proves callback delivery.
 *
 * Usage:
 *   pnpm tsx scripts/probe-onlogs.ts
 *   PROBE_PROGRAM_ID=<other-program> pnpm tsx scripts/probe-onlogs.ts
 *   PROBE_DURATION_S=60 pnpm tsx scripts/probe-onlogs.ts
 *
 * Exit codes:
 *   0 — got ≥1 callback within the window (WS pipeline healthy)
 *   1 — zero callbacks (suspect WS dead, RPC config wrong, or the
 *       chosen program is genuinely idle — try a busier one)
 *   2 — fatal SDK / connection error
 */

import { Connection, PublicKey } from "@solana/web3.js";

const RPC_URL = process.env.SOLANA_RPC_URL ?? "https://api.devnet.solana.com";
const WS_URL = process.env.SOLANA_WS_URL ?? "wss://api.devnet.solana.com";
// Default: SPL Token Program — universal, consistently has devnet activity.
const PROGRAM_ID =
  process.env.PROBE_PROGRAM_ID ?? "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA";
const DURATION_MS = Number.parseInt(process.env.PROBE_DURATION_S ?? "30", 10) * 1000;

async function main(): Promise<number> {
  console.log(`[probe] RPC:      ${RPC_URL}`);
  console.log(`[probe] WS:       ${WS_URL}`);
  console.log(`[probe] Program:  ${PROGRAM_ID}`);
  console.log(`[probe] Duration: ${DURATION_MS / 1000}s`);
  console.log("");

  const conn = new Connection(RPC_URL, { commitment: "confirmed", wsEndpoint: WS_URL });
  const pk = new PublicKey(PROGRAM_ID);

  let count = 0;
  const startedAt = Date.now();

  const subscriptionId = conn.onLogs(
    pk,
    (logsResult, ctx) => {
      if (logsResult.err) return;
      count += 1;
      const sig = logsResult.signature.slice(0, 8);
      console.log(
        `[probe] callback #${count.toString().padStart(3, "0")} sig=${sig}… slot=${ctx.slot} log_lines=${logsResult.logs.length}`,
      );
    },
    "confirmed",
  );
  console.log(`[probe] subscribed (subscriptionId=${subscriptionId})`);
  console.log("[probe] watching...");
  console.log("");

  await new Promise<void>((resolve) => setTimeout(resolve, DURATION_MS));

  try {
    await conn.removeOnLogsListener(subscriptionId);
  } catch (err) {
    console.warn(`[probe] removeOnLogsListener threw: ${(err as Error).message}`);
  }

  console.log("");
  console.log(`[probe] Got ${count} callback(s) in ${(Date.now() - startedAt) / 1000}s`);

  return count > 0 ? 0 : 1;
}

main()
  .then((code) => {
    // Force exit because the WS connection may keep the event loop alive.
    process.exit(code);
  })
  .catch((err) => {
    console.error(`[probe] fatal: ${err.stack ?? err.message}`);
    process.exit(2);
  });

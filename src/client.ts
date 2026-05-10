/**
 * src/client.ts — Solana RPC + WS subscription wiring (sprint B5)
 *
 * `createConnection()` reads RPC + WS URLs from env (fallback to public devnet).
 * `subscribeToLogs(connection, programId, idl)` wires Anchor's EventParser
 * to `connection.onLogs(programId, ...)`. The handler decodes via the
 * adapter, dedups via the ring buffer, and bumps health.
 *
 * Returns the subscription id so the reconnect loop can explicitly
 * `connection.removeOnLogsListener(id)` before re-subscribing — closes
 * H3 from the in-session review (Connection recreation alone does NOT
 * auto-resubscribe).
 */

import { BorshCoder, EventParser, type Idl } from "@coral-xyz/anchor";
import { Connection, PublicKey } from "@solana/web3.js";
import { stoneClaimedToMintActivity } from "./adapter.js";
import { insertActivity } from "./db.js";
import * as health from "./health.js";
import { pushIfNew } from "./ring-buffer.js";
import type { RawStoneClaimed } from "./types.js";

const DEFAULT_RPC_URL = "https://api.devnet.solana.com";
const DEFAULT_WS_URL = "wss://api.devnet.solana.com";
const DEFAULT_PROGRAM_ID = "7u27WmTz2hZHvvhL89XcSCY3eFhxEfHjUN5MjzMY6v38";

export function getProgramId(): PublicKey {
  return new PublicKey(process.env.INDEXER_PROGRAM_ID ?? DEFAULT_PROGRAM_ID);
}

export function createConnection(): Connection {
  const rpcUrl = process.env.SOLANA_RPC_URL ?? DEFAULT_RPC_URL;
  const wsUrl = process.env.SOLANA_WS_URL ?? DEFAULT_WS_URL;
  return new Connection(rpcUrl, { commitment: "confirmed", wsEndpoint: wsUrl });
}

export interface LogsSubscription {
  subscriptionId: number;
  programId: PublicKey;
}

/**
 * Subscribe to program logs. The handler chain for each delivered log batch:
 *   onLogs callback → EventParser.parseLogs → adapter → ring-buffer.pushIfNew → health.recordEvent
 *
 * Each log batch arrives with `{ signature, err, logs }`; `slot` arrives via
 * the second `Context` argument; blockTime is fetched lazily per signature
 * because `onLogs` does not provide it.
 */
export async function subscribeToLogs(
  connection: Connection,
  programId: PublicKey,
  idl: Idl,
): Promise<LogsSubscription> {
  const coder = new BorshCoder(idl);
  const parser = new EventParser(programId, coder);

  const subscriptionId = connection.onLogs(
    programId,
    async (logsResult, ctx) => {
      if (logsResult.err) return;
      const { signature, logs } = logsResult;
      const slot = ctx.slot;

      let blockTime: number | null = null;
      try {
        blockTime = await connection.getBlockTime(slot);
      } catch (err) {
        console.warn(
          `[client] getBlockTime(${slot}) failed for sig ${signature}: ${(err as Error).message}`,
        );
      }

      let logIndex = 0;
      try {
        for (const event of parser.parseLogs(logs)) {
          if (event.name !== "StoneClaimed") {
            logIndex += 1;
            continue;
          }
          try {
            const activity = stoneClaimedToMintActivity(event.data as unknown as RawStoneClaimed, {
              signature,
              logIndex,
              slot,
              blockTime,
            });
            const accepted = pushIfNew(activity);
            if (accepted) {
              health.recordEvent(new Date(activity.blockTime));
              // Fire-and-forget DB persistence. No-op when DATABASE_URL
              // is unset; logs + flips dbConnected on failure but never
              // blocks the ingestion path.
              void insertActivity(activity);
            }
          } catch (err) {
            console.error(
              `[client] adapter threw on sig ${signature} logIndex ${logIndex}: ${(err as Error).message}`,
            );
          }
          logIndex += 1;
        }
      } catch (err) {
        console.error(
          `[client] EventParser.parseLogs threw on sig ${signature}: ${(err as Error).message}`,
        );
      }
    },
    "confirmed",
  );

  return { subscriptionId, programId };
}

export async function disconnect(connection: Connection, sub: LogsSubscription): Promise<void> {
  try {
    await connection.removeOnLogsListener(sub.subscriptionId);
  } catch (err) {
    console.warn(
      `[client] removeOnLogsListener threw (subscription likely already dead): ${(err as Error).message}`,
    );
  }
}

/**
 * src/types.ts — public + internal type contracts (sprint task B1)
 *
 * `MintActivity` is the stable public shape exposed by `/events/recent`.
 * `RawStoneClaimed` is the internal Anchor parser output, locked to
 * Candidate A per A3+A4 spike resolution (`element` is `u8`).
 */

import type { PublicKey } from "@solana/web3.js";

export type Element = "wood" | "fire" | "earth" | "metal" | "water";

export interface MintActivity {
  signature: string;
  logIndex: number;
  slot: number;
  blockTime: number;
  wallet: string;
  element: Element;
  weather: Element;
  mint: string;
}

/**
 * Internal shape Anchor's EventParser emits for the `StoneClaimed` event.
 *
 * Locked to Candidate A per `src/idl/PROVENANCE.md` A3 confirmation
 * (element: u8 in IDL line 30) + A4 PARTIAL spike status. If a future
 * re-vendor reveals struct-tagged-enum encoding, this interface +
 * `src/adapter.ts` must reshape to Candidate B before B-phase locks.
 *
 * Field order matches the Rust source:
 *   pub wallet: Pubkey
 *   pub element: u8
 *   pub weather: u8
 *   pub mint: Pubkey
 */
export interface RawStoneClaimed {
  wallet: PublicKey;
  element: number;
  weather: number;
  mint: PublicKey;
}

export interface IndexerHealth {
  status: "ok" | "degraded" | "starting";
  service: "radar";
  version: string;
  indexerStarted: boolean;
  lastEventAt: string | null;
  count: number;
  connected: boolean;
  mode: "live" | "warmup";
  /**
   * Backup Postgres status. `null` when DATABASE_URL is unset (DB
   * disabled — running ring-buffer-only). `true` after a successful
   * query within the last interaction; `false` if any write/query
   * has failed since the last success.
   */
  dbConnected: boolean | null;
}

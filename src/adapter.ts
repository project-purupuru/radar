/**
 * src/adapter.ts — pure RawStoneClaimed → MintActivity conversion (sprint B3)
 *
 * Pure (no side effects beyond a single console.warn for null blockTime).
 * Throws Error on bytes outside `1..=5` with the offending signature in the
 * message so log scraping surfaces IDL drift loudly. (Project convention:
 * "Adapter throws on unknown bytes" — see CLAUDE.md.)
 *
 * A4 (HARD GATE) was PARTIAL on devnet — see `src/idl/PROVENANCE.md`. The
 * runtime guard below catches drift if the actual EventParser shape
 * differs from Candidate A.
 */

import type { Element, MintActivity, RawStoneClaimed } from "./types.js";

export const ELEMENT_BY_BYTE: Readonly<Record<number, Element>> = Object.freeze({
  1: "wood",
  2: "fire",
  3: "earth",
  4: "metal",
  5: "water",
});

function decodeElement(
  byte: unknown,
  fieldName: "element" | "weather",
  signature: string,
): Element {
  if (typeof byte !== "number" || !Number.isInteger(byte)) {
    throw new Error(
      `[adapter] ${fieldName} is not a number (got ${typeof byte} ${JSON.stringify(byte)}) ` +
        `at signature ${signature} — possible IDL drift, re-run scripts/verify-parser-shape.ts`,
    );
  }
  const decoded = ELEMENT_BY_BYTE[byte];
  if (!decoded) {
    throw new Error(
      `[adapter] invalid ${fieldName} byte ${byte} (expected 1-5) at signature ${signature}`,
    );
  }
  return decoded;
}

export interface AdapterContext {
  signature: string;
  logIndex: number;
  slot: number;
  blockTime: number | null;
}

export function stoneClaimedToMintActivity(
  raw: RawStoneClaimed,
  ctx: AdapterContext,
): MintActivity {
  const element = decodeElement(raw.element, "element", ctx.signature);
  const weather = decodeElement(raw.weather, "weather", ctx.signature);

  let blockTime: number;
  if (ctx.blockTime == null) {
    console.warn(
      `[adapter] null blockTime at signature ${ctx.signature}; falling back to Date.now()`,
    );
    blockTime = Date.now();
  } else {
    blockTime = ctx.blockTime * 1000;
  }

  return {
    signature: ctx.signature,
    logIndex: ctx.logIndex,
    slot: ctx.slot,
    blockTime,
    wallet: raw.wallet.toBase58(),
    element,
    weather,
    mint: raw.mint.toBase58(),
  };
}

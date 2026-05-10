/**
 * src/ring-buffer.ts — module-singleton bounded buffer with dedup (sprint B2)
 *
 * Holds the last `BUFFER_SIZE` MintActivity events. Dedup keyed on
 * `${signature}:${logIndex}`. On overflow, oldest event is evicted and its
 * id removed from the dedup set so the invariant
 * `seen.size === buffer.length` holds (closes review finding M2).
 *
 * Subscriber errors are isolated: a throwing subscriber does not poison
 * other subscribers or the main pushIfNew loop.
 */

import type { MintActivity } from "./types.js";

export const BUFFER_SIZE = 200;

const buffer: MintActivity[] = [];
const seen = new Set<string>();
const subscribers = new Set<(e: MintActivity) => void>();

const idOf = (e: MintActivity) => `${e.signature}:${e.logIndex}`;

export function pushIfNew(event: MintActivity): boolean {
  const id = idOf(event);
  if (seen.has(id)) return false;

  buffer.push(event);
  seen.add(id);

  if (buffer.length > BUFFER_SIZE) {
    const evicted = buffer.shift();
    if (evicted) seen.delete(idOf(evicted));
  }

  for (const cb of subscribers) {
    try {
      cb(event);
    } catch (err) {
      console.error("[ring-buffer] subscriber threw", err);
    }
  }

  return true;
}

export function recent(limit = BUFFER_SIZE): MintActivity[] {
  const clamped = Math.max(0, Math.min(limit, BUFFER_SIZE));
  return buffer.slice(-clamped).reverse();
}

export function size(): number {
  return buffer.length;
}

export function subscribe(cb: (e: MintActivity) => void): () => void {
  subscribers.add(cb);
  return () => {
    subscribers.delete(cb);
  };
}

export function _resetForTests(): void {
  buffer.length = 0;
  seen.clear();
  subscribers.clear();
}

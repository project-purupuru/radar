/**
 * scripts/verify-parser-shape.ts — sprint task A4 hard gate
 *
 * Loads the vendored IDL into Anchor's BorshCoder + EventParser, then attempts
 * to parse a real on-devnet StoneClaimed log line. Documents the actual
 * TypeScript shape EventParser yields, so B1 (src/types.ts) and B3
 * (src/adapter.ts) can be designed against verified output rather than
 * assumed bytes.
 *
 * Closes BLOCKER B2 from in-session adversarial review (2026-05-09).
 *
 * Usage:
 *   pnpm tsx scripts/verify-parser-shape.ts
 *
 * Optionally:
 *   SOLANA_RPC_URL=https://api.devnet.solana.com pnpm tsx scripts/verify-parser-shape.ts
 *
 * Exit codes:
 *   0 — parsed at least one StoneClaimed event, shape printed to stdout
 *   1 — discovery exhausted; no StoneClaimed event found in the recent
 *       transaction window. NOT necessarily a failure if no claims have
 *       happened recently — re-run after zksoju triggers a fresh claim.
 *   2 — IDL load failed, EventParser construction failed, or unexpected
 *       throw inside parseLogs. This IS a hard-gate failure: B1+B3 should
 *       not advance until resolved.
 */

import { BorshCoder, EventParser } from "@coral-xyz/anchor";
import { Connection, PublicKey } from "@solana/web3.js";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const PROGRAM_ID = "7u27WmTz2hZHvvhL89XcSCY3eFhxEfHjUN5MjzMY6v38";
const IDL_PATH = resolve(__dirname, "..", "src", "idl", "purupuru_anchor.json");
const RPC_URL = process.env.SOLANA_RPC_URL ?? "https://api.devnet.solana.com";
const SCAN_LIMIT = Number.parseInt(process.env.SCAN_LIMIT ?? "200", 10);

async function main(): Promise<number> {
	console.log(`[verify-parser-shape] RPC: ${RPC_URL}`);
	console.log(`[verify-parser-shape] Program ID: ${PROGRAM_ID}`);
	console.log(`[verify-parser-shape] IDL: ${IDL_PATH}`);
	console.log(`[verify-parser-shape] Scanning last ${SCAN_LIMIT} signatures...`);

	let idl: unknown;
	try {
		idl = JSON.parse(readFileSync(IDL_PATH, "utf-8"));
	} catch (err) {
		console.error(`[verify-parser-shape] IDL load failed: ${(err as Error).message}`);
		return 2;
	}

	let coder: BorshCoder;
	let parser: EventParser;
	try {
		// biome-ignore lint/suspicious/noExplicitAny: BorshCoder accepts any IDL shape
		coder = new BorshCoder(idl as any);
		parser = new EventParser(new PublicKey(PROGRAM_ID), coder);
	} catch (err) {
		console.error(
			`[verify-parser-shape] BorshCoder/EventParser construction failed: ${(err as Error).message}`,
		);
		return 2;
	}

	const conn = new Connection(RPC_URL, "confirmed");
	const programKey = new PublicKey(PROGRAM_ID);

	let signatures: { signature: string; slot: number; blockTime: number | null }[] = [];
	try {
		signatures = await conn.getSignaturesForAddress(programKey, { limit: SCAN_LIMIT });
	} catch (err) {
		console.error(
			`[verify-parser-shape] getSignaturesForAddress failed: ${(err as Error).message}`,
		);
		return 2;
	}
	console.log(`[verify-parser-shape] Found ${signatures.length} signatures.`);

	if (signatures.length === 0) {
		console.warn(
			"[verify-parser-shape] No prior signatures. The program may not have been called yet on devnet, or the RPC is filtering. Re-run after a fresh claim.",
		);
		return 1;
	}

	const dump = process.env.DUMP_LOGS === "1";
	for (const sig of signatures) {
		const tx = await conn.getTransaction(sig.signature, {
			commitment: "confirmed",
			maxSupportedTransactionVersion: 0,
		});
		if (!tx?.meta?.logMessages) continue;
		const logs = tx.meta.logMessages;

		if (dump) {
			console.log("");
			console.log(`---- sig ${sig.signature} (slot ${sig.slot}, blockTime ${sig.blockTime}) ----`);
			for (const line of logs) console.log(`  ${line}`);
		}

		// EventParser.parseLogs yields a generator of parsed events
		try {
			let parsedAny = false;
			for (const event of parser.parseLogs(logs)) {
				if (event.name !== "StoneClaimed") continue;
				parsedAny = true;
				console.log("");
				console.log("==================== EventParser shape (verified) ====================");
				console.log(`Source signature: ${sig.signature}`);
				console.log(`Slot: ${sig.slot}`);
				console.log(`BlockTime: ${sig.blockTime}`);
				console.log("event.name:", event.name);
				console.log("event.data:", JSON.stringify(event.data, null, 2));
				console.log("");
				console.log("Per-field type inspection:");
				const data = event.data as Record<string, unknown>;
				for (const [key, value] of Object.entries(data)) {
					console.log(`  ${key} → typeof=${typeof value} · ctor=${value?.constructor?.name ?? "null"} · stringified=${JSON.stringify(value)}`);
				}
				console.log("======================================================================");
				console.log("");
				console.log(
					"INTERPRETATION GUIDE:",
				);
				console.log(
					"  · element typeof number → Candidate A (raw u8) confirmed; adapter ELEMENT_BY_BYTE map applies as-is.",
				);
				console.log(
					"  · element typeof object with shape { wood: {} } → Candidate B (struct-tagged enum); adapter must switch on Object.keys(element)[0].",
				);
				console.log(
					"  · wallet/mint stringified looks like base58 (44 chars) → PublicKey-typed; call .toBase58() in adapter.",
				);
				console.log(
					"  · wallet/mint stringified looks like { _bn: ... } object → BN-wrapped; call new PublicKey(value).toBase58() in adapter.",
				);
				return 0;
			}
			if (parsedAny) return 0;
		} catch (err) {
			console.error(
				`[verify-parser-shape] parser.parseLogs threw on sig ${sig.signature}: ${(err as Error).message}`,
			);
			return 2;
		}
	}

	console.warn(
		`[verify-parser-shape] Scanned ${signatures.length} sigs; no StoneClaimed event matched. Either no claims have fired yet on this program, the discriminator is wrong, or all events failed parser.parseLogs filter. Re-run after zksoju triggers a fresh claim.`,
	);
	return 1;
}

main()
	.then((code) => process.exit(code))
	.catch((err) => {
		console.error(`[verify-parser-shape] fatal: ${err.stack ?? err.message}`);
		process.exit(2);
	});

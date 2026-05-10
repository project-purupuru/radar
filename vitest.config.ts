import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["src/**/*.test.ts"],
    exclude: ["node_modules", "dist", ".loa", ".claude", ".beads"],
    server: {
      deps: {
        // rpc-websockets (transitive of @solana/web3.js) is CJS but
        // depends on ESM-only uuid v14 — Vite needs to inline it.
        inline: [/@solana\/web3\.js/, /rpc-websockets/, /^uuid$/],
      },
    },
  },
});

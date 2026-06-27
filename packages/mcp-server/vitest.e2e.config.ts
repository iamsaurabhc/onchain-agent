import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["test/**/*.e2e.test.ts"],
    globals: false,
    environment: "node",
    // anvil startup + deploy + tx mining needs generous timeouts.
    testTimeout: 60_000,
    hookTimeout: 60_000,
    server: { deps: { inline: ["@onchain-agent/hash-core"] } },
  },
});

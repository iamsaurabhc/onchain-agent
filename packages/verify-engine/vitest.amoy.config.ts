import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["test/e2e/**/*.e2e.test.ts"],
    globals: false,
    environment: "node",
    testTimeout: 300_000,
    hookTimeout: 60_000,
    server: {
      deps: {
        inline: ["@onchain-agent/hash-core", "@onchain-agent/anchor-client"],
      },
    },
  },
});

import { defineConfig, configDefaults } from "vitest/config";

export default defineConfig({
  test: {
    include: ["test/**/*.test.ts"],
    exclude: [...configDefaults.exclude, "**/*.e2e.test.ts"],
    globals: false,
    environment: "node",
    testTimeout: 20_000,
    hookTimeout: 20_000,
    server: {
      deps: {
        inline: [
          "@onchain-agent/hash-core",
          "@onchain-agent/anchor-client",
          "@onchain-agent/verify-engine",
          "@onchain-agent/mcp-server",
        ],
      },
    },
  },
});

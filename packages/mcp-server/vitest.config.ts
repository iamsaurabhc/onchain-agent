import { defineConfig } from "vitest/config";
import { configDefaults } from "vitest/config";

export default defineConfig({
  test: {
    include: ["test/**/*.test.ts"],
    // e2e (live anvil) runs via vitest.e2e.config.ts; keep it out of the unit run.
    exclude: [...configDefaults.exclude, "**/*.e2e.test.ts"],
    globals: false,
    environment: "node",
    testTimeout: 20_000,
    hookTimeout: 20_000,
    // hash-core is a TS workspace package; inline it so vite transforms its source.
    server: { deps: { inline: ["@onchain-agent/hash-core"] } },
  },
});

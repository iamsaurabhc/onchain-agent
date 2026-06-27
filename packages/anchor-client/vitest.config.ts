import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["test/**/*.test.ts"],
    globals: false,
    environment: "node",
    server: { deps: { inline: ["@onchain-agent/hash-core"] } },
  },
});

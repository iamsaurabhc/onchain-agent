#!/usr/bin/env node
/**
 * Phase F HTTP entrypoint. Delegates to `mastra dev` for A2A + agent-card serving.
 * Set OPENROUTER_API_KEY and chain env vars before starting.
 */
import { spawn } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { loadA2AConfig } from "./config.js";

const pkgRoot = dirname(fileURLToPath(import.meta.url)) + "/..";

async function main(): Promise<void> {
  const config = loadA2AConfig();
  const port = String(config.a2aPort);

  console.log(`Starting Mastra A2A server on port ${port}…`);
  console.log("Agent cards: anchor-payload, verify-anchor");

  const child = spawn("pnpm", ["exec", "mastra", "dev", "--port", port], {
    cwd: pkgRoot,
    stdio: "inherit",
    env: { ...process.env, MASTRA_DEV_NO_OPEN: "true" },
  });

  child.on("exit", (code) => {
    process.exit(code ?? 0);
  });
}

main().catch((err) => {
  console.error("a2a-agent server failed:", err);
  process.exit(1);
});

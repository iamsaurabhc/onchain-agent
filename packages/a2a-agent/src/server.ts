#!/usr/bin/env node
/**
 * Phase F HTTP entrypoint.
 *
 * Starts the Mastra Hono server directly via `createNodeServer` (run with tsx),
 * rather than the `mastra dev` CLI. The CLI bundler packs every workspace
 * dependency as a real npm package; our workspace packages ship raw TypeScript
 * (`main: src/index.ts`), which Node's ESM loader cannot import
 * (ERR_UNKNOWN_FILE_EXTENSION). tsx transpiles those `.ts` files on the fly, so
 * the server boots cleanly while still exposing the native A2A endpoints:
 *   - GET  /.well-known/:agentId/agent-card.json
 *   - POST /a2a/:agentId
 *
 * Set OPENROUTER_API_KEY and chain env vars before starting.
 */
import { createNodeServer } from "@mastra/deployer/server";
import { loadA2AConfig } from "./config.js";
import { mastra } from "./mastra/index.js";

async function main(): Promise<void> {
  const config = loadA2AConfig();
  const port = config.a2aPort;

  // `tools` is required by some @mastra/deployer versions and absent in others;
  // include it and cast to the resolved parameter type so the entry compiles
  // regardless of which deployer typings are picked up.
  await createNodeServer(mastra, {
    isDev: true,
    playground: false,
    tools: {},
  } as Parameters<typeof createNodeServer>[1]);

  console.log(`Mastra A2A server listening on http://localhost:${port}`);
  console.log("Agents: anchor-payload, verify-anchor");
  console.log(
    `Agent cards: http://localhost:${port}/.well-known/anchor-payload/agent-card.json`,
  );
}

main().catch((err) => {
  console.error("a2a-agent server failed:", err);
  process.exit(1);
});

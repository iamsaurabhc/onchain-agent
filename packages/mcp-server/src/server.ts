#!/usr/bin/env node
import { MCPServer } from "@mastra/mcp";
import { loadLocalEnv, loadConfig, ViemRegistryClient } from "@onchain-agent/anchor-client";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { createTools } from "./tools/index.js";

/**
 * Phase D/E stdio entrypoint: wire the viem-backed registry client to MCP tools
 * and serve them over stdio for any MCP host (Cursor, Claude, etc.).
 */
async function main(): Promise<void> {
  loadLocalEnv(import.meta.url, dirname(fileURLToPath(import.meta.url)) + "/..");
  const config = loadConfig();
  const client = new ViemRegistryClient(config);
  const tools = createTools(client, config);

  const server = new MCPServer({
    name: "onchain-anchor",
    version: "0.1.0",
    description:
      "Anchor and verify cryptographic hashes of off-chain payloads against AnchorRegistry.",
    tools,
  });

  await server.startStdio();
}

main().catch((error) => {
  console.error("onchain-anchor MCP server failed to start:", error);
  process.exit(1);
});

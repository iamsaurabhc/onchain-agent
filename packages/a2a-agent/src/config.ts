import { createOpenAI } from "@ai-sdk/openai";
import type { MastraLanguageModel } from "@mastra/core/agent";
import { loadLocalEnv } from "@onchain-agent/anchor-client";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const DEFAULT_MODEL_LARGE = "nvidia/nemotron-3-ultra-550b-a55b:free";
const DEFAULT_MODEL_SMALL = "openai/gpt-oss-20b:free";
const DEFAULT_MCP_COMMAND = "tsx";
const DEFAULT_MCP_ARGS = "packages/mcp-server/src/server.ts";
const DEFAULT_A2A_PORT = 4111;

export interface A2AConfig {
  openRouterApiKey?: string;
  modelLarge: string;
  modelSmall: string;
  mcpCommand: string;
  mcpArgs: string[];
  a2aPort: number;
}

function splitArgs(raw: string): string[] {
  return raw
    .split(/\s+/)
    .map((s) => s.trim())
    .filter(Boolean);
}

/** Load Phase F env (also loads repo `.env.local` via anchor-client helper). */
export function loadA2AConfig(env: NodeJS.ProcessEnv = process.env): A2AConfig {
  loadLocalEnv(import.meta.url, dirname(fileURLToPath(import.meta.url)) + "/..");

  const mcpArgsRaw = env.A2A_MCP_ARGS ?? DEFAULT_MCP_ARGS;
  const a2aPort = env.A2A_PORT ? Number(env.A2A_PORT) : DEFAULT_A2A_PORT;
  if (!Number.isInteger(a2aPort) || a2aPort <= 0) {
    throw new Error(`A2A_PORT must be a positive integer, got: ${env.A2A_PORT}`);
  }

  return {
    openRouterApiKey: env.OPENROUTER_API_KEY,
    modelLarge: env.A2A_MODEL_LARGE ?? DEFAULT_MODEL_LARGE,
    modelSmall: env.A2A_MODEL_SMALL ?? DEFAULT_MODEL_SMALL,
    mcpCommand: env.A2A_MCP_COMMAND ?? DEFAULT_MCP_COMMAND,
    mcpArgs: splitArgs(mcpArgsRaw),
    a2aPort,
  };
}

/** OpenRouter-backed language model (Vercel AI SDK provider layer). */
export function createOpenRouterModel(
  modelId: string,
  apiKey?: string,
): MastraLanguageModel {
  const key = apiKey ?? process.env.OPENROUTER_API_KEY;
  if (!key) {
    throw new Error("OPENROUTER_API_KEY is required for LLM-backed agents");
  }
  const openrouter = createOpenAI({
    name: "openrouter",
    baseURL: "https://openrouter.ai/api/v1",
    apiKey: key,
  });
  return openrouter(modelId);
}

/** Resolve MCP server entry path relative to repo root when using the default. */
export function resolveMcpServerCwd(repoRoot: string, mcpArgs: string[]): string {
  if (mcpArgs.length === 1 && mcpArgs[0]!.includes("mcp-server")) {
    return repoRoot;
  }
  return repoRoot;
}

export function defaultMcpServerEntry(repoRoot: string): string {
  return join(repoRoot, "packages/mcp-server/src/server.ts");
}

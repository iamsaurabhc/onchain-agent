/**
 * Mastra CLI entrypoint (`mastra dev`): load env, wire toolset, export Mastra instance.
 */
import { createMockModel } from "@mastra/core";
import type { MastraLanguageModel } from "@mastra/core/agent";
import { loadConfig, ViemRegistryClient } from "@onchain-agent/anchor-client";
import { createMastraInstance } from "../mastra.js";
import { createOpenRouterModel, loadA2AConfig } from "../config.js";
import { fromCreateTools, fromMcpClient } from "../toolset.js";
import type { AnchorToolset } from "../toolset.js";

async function resolveToolset(): Promise<AnchorToolset> {
  const useMcpSubprocess = process.env.A2A_USE_MCP_SUBPROCESS === "1";
  if (useMcpSubprocess) {
    const a2a = loadA2AConfig();
    return fromMcpClient({
      command: a2a.mcpCommand,
      args: a2a.mcpArgs,
    });
  }

  const config = loadConfig();
  const client = new ViemRegistryClient(config);
  return fromCreateTools(client, config);
}

function resolveModel(modelId: string, apiKey?: string): MastraLanguageModel {
  if (!apiKey) {
    return createMockModel({ mockText: `mock model for ${modelId}` });
  }
  return createOpenRouterModel(modelId, apiKey);
}

const a2aConfig = loadA2AConfig();
const toolset = await resolveToolset();

export const mastra = createMastraInstance({
  toolset,
  anchorModel: resolveModel(a2aConfig.modelLarge, a2aConfig.openRouterApiKey),
  verifyModel: resolveModel(a2aConfig.modelSmall, a2aConfig.openRouterApiKey),
});

export { toolset };

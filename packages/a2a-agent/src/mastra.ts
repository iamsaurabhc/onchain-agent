import { Mastra } from "@mastra/core";
import type { MastraLanguageModel } from "@mastra/core/agent";
import type { AnchorToolset } from "./toolset.js";
import { createAgents } from "./agents.js";

export interface CreateMastraOptions {
  toolset: AnchorToolset;
  anchorModel: MastraLanguageModel;
  verifyModel: MastraLanguageModel;
  /** HTTP port for the A2A server (used by createNodeServer). */
  port?: number;
  /** HTTP host for the A2A server. */
  host?: string;
}

/**
 * Register anchor/verify agents on a Mastra instance.
 * Mastra exposes A2A endpoints (`/a2a/:agentId`) and agent cards
 * (`/.well-known/:agentId/agent-card.json`) when served via createNodeServer.
 */
export function createMastraInstance(opts: CreateMastraOptions): Mastra {
  const { anchorPayloadAgent, verifyAnchorAgent } = createAgents(opts);

  return new Mastra({
    agents: {
      "anchor-payload": anchorPayloadAgent,
      "verify-anchor": verifyAnchorAgent,
    },
    server: {
      port: opts.port,
      host: opts.host,
    },
  });
}

import { Mastra } from "@mastra/core";
import type { MastraLanguageModel } from "@mastra/core/agent";
import type { AnchorToolset } from "./toolset.js";
import { createAgents } from "./agents.js";

export interface CreateMastraOptions {
  toolset: AnchorToolset;
  anchorModel: MastraLanguageModel;
  verifyModel: MastraLanguageModel;
}

/**
 * Register anchor/verify agents on a Mastra instance.
 * Mastra exposes A2A endpoints and agent cards when served via `mastra dev`.
 */
export function createMastraInstance(opts: CreateMastraOptions): Mastra {
  const { anchorPayloadAgent, verifyAnchorAgent } = createAgents(opts);

  return new Mastra({
    agents: {
      "anchor-payload": anchorPayloadAgent,
      "verify-anchor": verifyAnchorAgent,
    },
  });
}

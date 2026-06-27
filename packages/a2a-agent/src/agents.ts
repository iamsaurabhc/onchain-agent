import { Agent } from "@mastra/core/agent";
import { createTool } from "@mastra/core/tools";
import type { MastraLanguageModel } from "@mastra/core/agent";
import type { AnchorToolset } from "./toolset.js";
import { anchorPayload } from "./skills/anchorPayload.js";
import { verifyAnchor } from "./skills/verifyAnchor.js";
import {
  anchorPayloadInputSchema,
  anchorPayloadOutputSchema,
  verifyAnchorInputSchema,
} from "./schemas.js";
import { verificationResultSchema } from "./verificationSchema.js";

const ANCHOR_INSTRUCTIONS = `You are the anchor-payload skill for onchain-agent.
Your only job is to anchor an off-chain payload hash on-chain.
When asked to anchor, call the anchor_payload tool with the task parameters.
Return the tool's structured output verbatim. Never invent hashes, tx hashes, or block info.`;

const VERIFY_INSTRUCTIONS = `You are the verify-anchor skill for onchain-agent.
Your only job is to verify whether a payload/hash was genuinely anchored on-chain.
When asked to verify, call the verify_anchor tool with the task parameters.
Return the tool's structured output verbatim. Never invent verification verdicts or on-chain records.`;

function makeAnchorPayloadTool(toolset: AnchorToolset) {
  return createTool({
    id: "anchor_payload",
    description:
      "Anchor a payload's cryptographic hash on-chain via AnchorRegistry. " +
      "Returns hash + tx/block reference.",
    inputSchema: anchorPayloadInputSchema,
    outputSchema: anchorPayloadOutputSchema,
    execute: async ({ context }) => anchorPayload(toolset, context),
  });
}

function makeVerifyAnchorTool(toolset: AnchorToolset) {
  return createTool({
    id: "verify_anchor",
    description:
      "Verify anchoring on the live chain. Re-derives hashes from payloads; " +
      "returns verified true/false with machine-readable reason.",
    inputSchema: verifyAnchorInputSchema,
    outputSchema: verificationResultSchema,
    execute: async ({ context }) => verifyAnchor(toolset, context),
  });
}

export interface CreateAgentsOptions {
  toolset: AnchorToolset;
  anchorModel: MastraLanguageModel;
  verifyModel: MastraLanguageModel;
}

export interface AnchorAgents {
  anchorPayloadAgent: Agent;
  verifyAnchorAgent: Agent;
}

/** Build LLM-backed Mastra agents wrapping the deterministic skill cores. */
export function createAgents(opts: CreateAgentsOptions): AnchorAgents {
  const anchorTool = makeAnchorPayloadTool(opts.toolset);
  const verifyTool = makeVerifyAnchorTool(opts.toolset);

  const anchorPayloadAgent = new Agent({
    name: "anchor-payload",
    description:
      "Anchor a cryptographic hash of an arbitrary off-chain payload to the testnet.",
    instructions: ANCHOR_INSTRUCTIONS,
    model: opts.anchorModel,
    tools: { anchor_payload: anchorTool },
  });

  const verifyAnchorAgent = new Agent({
    name: "verify-anchor",
    description:
      "Verify against the live testnet whether a payload/hash was genuinely anchored.",
    instructions: VERIFY_INSTRUCTIONS,
    model: opts.verifyModel,
    tools: { verify_anchor: verifyTool },
  });

  return { anchorPayloadAgent, verifyAnchorAgent };
}

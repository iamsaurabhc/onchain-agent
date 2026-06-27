import { createTool } from "@mastra/core/tools";
import { z } from "zod";
import type { Hex32 } from "@onchain-agent/hash-core";
import type { Config, RegistryClient } from "@onchain-agent/anchor-client";
import { createEngine } from "./engine.js";
import { hex32, verificationResultSchema } from "./schemas.js";

export function makeVerifyByTx(client: RegistryClient, config: Config) {
  const engine = createEngine(client, config);
  return createTool({
    id: "verify_by_tx",
    description:
      "Verify anchoring by transaction hash: decode the Anchored event from the " +
      "tx receipt and confirm the hash/anchorer/block.",
    inputSchema: z.object({
      txHash: hex32,
      expectedHash: hex32
        .optional()
        .describe("if set, an anchoring event in this tx must match this hash"),
    }),
    outputSchema: verificationResultSchema,
    execute: async ({ context }) =>
      engine.verifyByTx({
        txHash: context.txHash as Hex32,
        expectedHash: context.expectedHash as Hex32 | undefined,
      }),
  });
}

export type VerifyByTxResult = ReturnType<typeof makeVerifyByTx>;

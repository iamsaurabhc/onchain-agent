import { createTool } from "@mastra/core/tools";
import { z } from "zod";
import type { Hex32 } from "@onchain-agent/hash-core";
import type { Config, RegistryClient } from "@onchain-agent/anchor-client";
import { ZERO_ADDRESS } from "@onchain-agent/anchor-client";
import { createEngine } from "./engine.js";
import { algoSchema, hex32, verificationResultSchema } from "./schemas.js";

const getAnchorOutputSchema = verificationResultSchema.extend({
  algo: algoSchema.nullable(),
  isMerkleRoot: z.boolean().nullable(),
  metadataHash: hex32.nullable(),
});

export function makeGetAnchor(client: RegistryClient, config: Config) {
  const engine = createEngine(client, config);
  return createTool({
    id: "get_anchor",
    description: "Look up the on-chain anchor record for a 32-byte hash.",
    inputSchema: z.object({
      hash: hex32,
      crossCheckLogs: z
        .boolean()
        .optional()
        .describe("cross-check storage against event logs (REORG on mismatch)"),
    }),
    outputSchema: getAnchorOutputSchema,
    execute: async ({ context }) => {
      const hash = context.hash as Hex32;
      const result = await engine.verifyByHash({
        hash,
        crossCheckLogs: context.crossCheckLogs,
      });

      if (result.verified) {
        const record = await client.getRecord(hash);
        return {
          ...result,
          algo: record.algo,
          isMerkleRoot: record.isMerkleRoot,
          metadataHash: record.metadataHash as Hex32,
        };
      }

      // Populate extended fields when we have a stored record (e.g. INSUFFICIENT_CONFIRMATIONS).
      if (
        result.reason !== "RPC_ERROR" &&
        result.reason !== "NOT_FOUND" &&
        result.anchorer &&
        result.anchorer.toLowerCase() !== ZERO_ADDRESS
      ) {
        const record = await client.getRecord(hash);
        return {
          ...result,
          algo: record.algo,
          isMerkleRoot: record.isMerkleRoot,
          metadataHash: record.metadataHash as Hex32,
        };
      }

      return { algo: null, isMerkleRoot: null, metadataHash: null, ...result };
    },
  });
}

export type GetAnchorResult = ReturnType<typeof makeGetAnchor>;

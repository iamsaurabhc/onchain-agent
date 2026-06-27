import { createTool } from "@mastra/core/tools";
import { z } from "zod";
import type { Hex32 } from "@onchain-agent/hash-core";
import type { Config } from "../config.js";
import type { RegistryClient } from "../registryClient.js";
import { fail, Reason } from "../result.js";
import { ZERO_ADDRESS, finalizeAnchored, withRpcErrorBoundary } from "./_shared.js";
import { algoSchema, hex32, verificationResultSchema } from "./schemas.js";

/** Extends the §5.1 result with the raw record fields for direct lookups. */
const getAnchorOutputSchema = verificationResultSchema.extend({
  algo: algoSchema.nullable(),
  isMerkleRoot: z.boolean().nullable(),
  metadataHash: hex32.nullable(),
});

/**
 * `get_anchor` — verify by hash (§5 method 1). Cheapest path: reads the stored
 * record for `hash` and returns it (or NOT_FOUND).
 */
export function makeGetAnchor(client: RegistryClient, config: Config) {
  return createTool({
    id: "get_anchor",
    description: "Look up the on-chain anchor record for a 32-byte hash.",
    inputSchema: z.object({
      hash: hex32,
    }),
    outputSchema: getAnchorOutputSchema,
    execute: async ({ context }) => {
      const hash = context.hash as Hex32;
      const result = await withRpcErrorBoundary("by_hash", client.chainId, async () => {
        const record = await client.getRecord(hash);
        if (record.anchorer.toLowerCase() === ZERO_ADDRESS) {
          return fail({
            method: "by_hash",
            reason: Reason.NOT_FOUND,
            chainId: client.chainId,
            hash,
          });
        }
        const finalized = await finalizeAnchored({
          client,
          config,
          method: "by_hash",
          hash,
          anchorer: record.anchorer,
          blockNumber: record.blockNumber,
          blockTimestamp: record.blockTimestamp,
        });
        return {
          ...finalized,
          algo: record.algo,
          isMerkleRoot: record.isMerkleRoot,
          metadataHash: record.metadataHash as Hex32,
        };
      });

      // Ensure the extended fields are always present (RPC_ERROR / NOT_FOUND paths).
      return { algo: null, isMerkleRoot: null, metadataHash: null, ...result };
    },
  });
}

export type GetAnchorResult = ReturnType<typeof makeGetAnchor>;

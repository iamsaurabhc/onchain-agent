import { createTool } from "@mastra/core/tools";
import { z } from "zod";
import type { Hex32 } from "@onchain-agent/hash-core";
import type { Config } from "../config.js";
import type { RegistryClient } from "../registryClient.js";
import { fail, Reason } from "../result.js";
import { finalizeAnchored, withRpcErrorBoundary } from "./_shared.js";
import { hex32, verificationResultSchema } from "./schemas.js";

/**
 * `verify_by_tx` — verify by transaction hash (§5 method 3). Fetches the tx
 * receipt, decodes its anchoring event(s), and confirms which transaction did
 * the anchoring. If `expectedHash` is given it must match a decoded event.
 */
export function makeVerifyByTx(client: RegistryClient, config: Config) {
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
    execute: async ({ context }) => {
      const txHash = context.txHash as Hex32;
      const expectedHash = context.expectedHash as Hex32 | undefined;

      return withRpcErrorBoundary("by_tx", client.chainId, async () => {
        const logs = await client.parseAnchoredLogs(txHash);
        if (logs.length === 0) {
          return fail({
            method: "by_tx",
            reason: Reason.NOT_FOUND,
            chainId: client.chainId,
          });
        }

        const log = expectedHash
          ? logs.find((l) => l.hash.toLowerCase() === expectedHash.toLowerCase())
          : logs[0];

        if (!log) {
          return fail({
            method: "by_tx",
            reason: Reason.HASH_MISMATCH,
            chainId: client.chainId,
            hash: expectedHash ?? null,
          });
        }

        return finalizeAnchored({
          client,
          config,
          method: "by_tx",
          hash: log.hash,
          anchorer: log.anchorer,
          blockNumber: log.blockNumber,
          blockTimestamp: log.blockTimestamp,
        });
      });
    },
  });
}

export type VerifyByTxResult = ReturnType<typeof makeVerifyByTx>;

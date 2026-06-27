import { createTool } from "@mastra/core/tools";
import { z } from "zod";
import type { CodecId, Hex32 } from "@onchain-agent/hash-core";
import type { Config } from "../config.js";
import type { RegistryClient } from "../registryClient.js";
import { fail, Reason } from "../result.js";
import type { PayloadEncoding } from "../payload.js";
import {
  ZERO_ADDRESS,
  deriveDirectHash,
  finalizeAnchored,
  withRpcErrorBoundary,
} from "./_shared.js";
import {
  algoSchema,
  codecIdSchema,
  encodingSchema,
  hex32,
  payloadSchema,
  verificationResultSchema,
} from "./schemas.js";

/**
 * `verify_hash` — verify by payload (§5 method 2). ALWAYS re-derives the hash
 * from the supplied payload; a caller-supplied `claimedHash` is only used to
 * detect tampering (HASH_MISMATCH) and is never trusted as the query key.
 */
export function makeVerifyHash(client: RegistryClient, config: Config) {
  return createTool({
    id: "verify_hash",
    description:
      "Verify that a payload was anchored. Re-derives the hash from the payload " +
      "(never trusting a caller-supplied hash), then checks the chain.",
    inputSchema: z.object({
      payload: payloadSchema,
      codecId: codecIdSchema,
      algo: algoSchema,
      encoding: encodingSchema,
      salt: hex32.optional().describe("required for salted algos (0x11/0x12)"),
      claimedHash: hex32
        .optional()
        .describe("optional hash the caller claims; mismatch => HASH_MISMATCH"),
    }),
    outputSchema: verificationResultSchema,
    execute: async ({ context }) => {
      // Re-derivation happens outside the RPC boundary: a bad payload/salt is a
      // caller error, not an RPC error.
      const { hash } = deriveDirectHash(
        {
          codecId: context.codecId as CodecId,
          algo: context.algo,
          payload: context.payload,
          encoding: context.encoding as PayloadEncoding,
          salt: context.salt,
        },
        true,
      );

      if (context.claimedHash && context.claimedHash.toLowerCase() !== hash.toLowerCase()) {
        return fail({
          method: "by_payload",
          reason: Reason.HASH_MISMATCH,
          chainId: client.chainId,
          hash,
        });
      }

      return withRpcErrorBoundary("by_payload", client.chainId, async () => {
        const record = await client.getRecord(hash);
        if (record.anchorer.toLowerCase() === ZERO_ADDRESS) {
          return fail({
            method: "by_payload",
            reason: Reason.NOT_FOUND,
            chainId: client.chainId,
            hash,
          });
        }
        return finalizeAnchored({
          client,
          config,
          method: "by_payload",
          hash,
          anchorer: record.anchorer,
          blockNumber: record.blockNumber,
          blockTimestamp: record.blockTimestamp,
        });
      });
    },
  });
}

export type VerifyHashResult = ReturnType<typeof makeVerifyHash>;
export type { Hex32 };

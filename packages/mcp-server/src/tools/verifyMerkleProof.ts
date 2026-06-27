import { createTool } from "@mastra/core/tools";
import { z } from "zod";
import { merkle, type Hex32 } from "@onchain-agent/hash-core";
import type { Config } from "../config.js";
import type { RegistryClient } from "../registryClient.js";
import { fail, Reason } from "../result.js";
import { decodeBytes, type PayloadEncoding } from "../payload.js";
import { finalizeAnchored, withRpcErrorBoundary } from "./_shared.js";
import { encodingSchema, hex32, verificationResultSchema } from "./schemas.js";

/**
 * `verify_merkle_proof` — verify by Merkle proof (§5 method 4). Requires BOTH
 * `verifyMerkle(root, leaf, proof)` and `isAnchored(root)` to hold. A leaf may
 * be supplied directly or derived from raw `leafPayload` bytes.
 */
export function makeVerifyMerkleProof(client: RegistryClient, config: Config) {
  return createTool({
    id: "verify_merkle_proof",
    description:
      "Verify a Merkle membership proof against an anchored root. Both the proof " +
      "and the root's anchoring must hold.",
    inputSchema: z
      .object({
        root: hex32,
        proof: z.array(hex32).describe("sorted-pair sibling hashes (OZ convention)"),
        leaf: hex32.optional().describe("the leaf hash; or supply leafPayload"),
        leafPayload: z
          .string()
          .optional()
          .describe("raw leaf bytes (string) to derive the leaf = keccak256(bytes)"),
        encoding: encodingSchema,
      })
      .refine((v) => v.leaf !== undefined || v.leafPayload !== undefined, {
        message: "provide either leaf or leafPayload",
      }),
    outputSchema: verificationResultSchema,
    execute: async ({ context }) => {
      const root = context.root as Hex32;
      // Derive the leaf outside the RPC boundary (caller-side data).
      const leaf: Hex32 = context.leaf
        ? (context.leaf as Hex32)
        : merkle.leafHash(
            decodeBytes(context.leafPayload as string, context.encoding as PayloadEncoding),
          );
      const proof = context.proof as Hex32[];

      return withRpcErrorBoundary("by_merkle", client.chainId, async () => {
        const proofOk = await client.verifyMerkle(root, leaf, proof);
        if (!proofOk) {
          return fail({
            method: "by_merkle",
            reason: Reason.MERKLE_PROOF_INVALID,
            chainId: client.chainId,
            hash: root,
          });
        }

        const anchored = await client.isAnchored(root);
        if (!anchored) {
          return fail({
            method: "by_merkle",
            reason: Reason.ROOT_NOT_ANCHORED,
            chainId: client.chainId,
            hash: root,
          });
        }

        const record = await client.getRecord(root);
        return finalizeAnchored({
          client,
          config,
          method: "by_merkle",
          hash: root,
          anchorer: record.anchorer,
          blockNumber: record.blockNumber,
          blockTimestamp: record.blockTimestamp,
        });
      });
    },
  });
}

export type VerifyMerkleProofResult = ReturnType<typeof makeVerifyMerkleProof>;

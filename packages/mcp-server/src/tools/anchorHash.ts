import { createTool } from "@mastra/core/tools";
import { z } from "zod";
import {
  AlgoTag,
  CodecId,
  isMerkle,
  merkle,
  type Hex32,
} from "@onchain-agent/hash-core";
import type { Config } from "../config.js";
import type { RegistryClient } from "../registryClient.js";
import { decodeBytes, type PayloadEncoding } from "../payload.js";
import { deriveDirectHash } from "./_shared.js";
import {
  algoSchema,
  codecIdSchema,
  encodingSchema,
  hex32,
  payloadSchema,
} from "./schemas.js";

const ZERO_HASH = `0x${"0".repeat(64)}` as Hex32;

const anchorOutputSchema = z.object({
  hash: hex32,
  txHash: hex32,
  blockNumber: z.number(),
  blockTimestamp: z.number(),
  chainId: z.number(),
  anchorer: z.string(),
  algo: algoSchema,
  codecId: codecIdSchema,
  isMerkleRoot: z.boolean(),
  salt: hex32.optional(),
});

/**
 * `anchor_hash` — derive a hash from a payload (or a Merkle root from leaves)
 * and write it on-chain via `AnchorRegistry`. Returns the hash plus the tx /
 * block reference. Requires a configured signer (ANCHORER_PRIVATE_KEY).
 */
export function makeAnchorHash(client: RegistryClient, config: Config) {
  return createTool({
    id: "anchor_hash",
    description:
      "Anchor a payload's hash (or a Merkle root over leaves) on-chain and return " +
      "the hash with its transaction/block reference.",
    inputSchema: z
      .object({
        codecId: codecIdSchema,
        algo: algoSchema,
        encoding: encodingSchema,
        payload: payloadSchema.optional().describe("payload for direct (non-Merkle) algos"),
        leaves: z
          .array(z.string())
          .optional()
          .describe("leaf payloads (strings) for Merkle algo 0x20"),
        salt: hex32.optional().describe("salt for salted algos; auto-generated if omitted"),
        metadataHash: hex32.optional().describe("optional caller-bound context (bytes32)"),
      })
      .refine((v) => v.payload !== undefined || v.leaves !== undefined, {
        message: "provide either payload (direct) or leaves (merkle)",
      }),
    outputSchema: anchorOutputSchema,
    execute: async ({ context }) => {
      const metadataHash = (context.metadataHash as Hex32 | undefined) ?? ZERO_HASH;
      const merkleMode = isMerkle(context.algo as AlgoTag);

      let hash: Hex32;
      let salt: `0x${string}` | undefined;
      let write;

      if (merkleMode) {
        if (!context.leaves || context.leaves.length === 0) {
          throw new Error("Merkle algo (0x20) requires a non-empty leaves array");
        }
        const leafHashes = context.leaves.map((l) =>
          merkle.leafHash(decodeBytes(l, context.encoding as PayloadEncoding)),
        );
        hash = merkle.buildRoot(leafHashes);
        write = await client.anchorMerkleRoot(hash, context.algo, metadataHash);
      } else {
        if (context.payload === undefined) {
          throw new Error("direct algos require a payload");
        }
        const derived = deriveDirectHash(
          {
            codecId: context.codecId as CodecId,
            algo: context.algo,
            payload: context.payload,
            encoding: context.encoding as PayloadEncoding,
            salt: context.salt,
          },
          false,
        );
        hash = derived.hash;
        salt = derived.salt;
        write = await client.anchor(hash, context.algo, metadataHash);
      }

      return {
        hash,
        txHash: write.txHash,
        blockNumber: Number(write.blockNumber),
        blockTimestamp: Number(write.blockTimestamp),
        chainId: client.chainId,
        anchorer: write.anchorer,
        algo: context.algo,
        codecId: context.codecId,
        isMerkleRoot: merkleMode,
        ...(salt ? { salt } : {}),
      };
    },
  });
}

export type AnchorHashResult = ReturnType<typeof makeAnchorHash>;

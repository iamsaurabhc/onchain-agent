import { createTool } from "@mastra/core/tools";
import { z } from "zod";
import type { Hex32 } from "@onchain-agent/hash-core";
import type { Config, RegistryClient } from "@onchain-agent/anchor-client";
import type { PayloadEncoding } from "@onchain-agent/anchor-client";
import { createEngine } from "./engine.js";
import { encodingSchema, hex32, verificationResultSchema } from "./schemas.js";

export function makeVerifyMerkleProof(client: RegistryClient, config: Config) {
  const engine = createEngine(client, config);
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
    execute: async ({ context }) =>
      engine.verifyByMerkle({
        root: context.root as Hex32,
        proof: context.proof as Hex32[],
        leaf: context.leaf as Hex32 | undefined,
        leafPayload: context.leafPayload,
        encoding: context.encoding as PayloadEncoding,
      }),
  });
}

export type VerifyMerkleProofResult = ReturnType<typeof makeVerifyMerkleProof>;

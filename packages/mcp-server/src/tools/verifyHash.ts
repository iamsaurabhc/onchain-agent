import { createTool } from "@mastra/core/tools";
import { z } from "zod";
import type { CodecId, Hex32 } from "@onchain-agent/hash-core";
import type { Config, RegistryClient } from "@onchain-agent/anchor-client";
import type { PayloadEncoding } from "@onchain-agent/anchor-client";
import { createEngine } from "./engine.js";
import {
  algoSchema,
  codecIdSchema,
  encodingSchema,
  hex32,
  payloadSchema,
  verificationResultSchema,
} from "./schemas.js";

export function makeVerifyHash(client: RegistryClient, config: Config) {
  const engine = createEngine(client, config);
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
    execute: async ({ context }) =>
      engine.verifyByPayload({
        codecId: context.codecId as CodecId,
        algo: context.algo,
        payload: context.payload,
        encoding: context.encoding as PayloadEncoding,
        salt: context.salt,
        claimedHash: context.claimedHash as Hex32 | undefined,
      }),
  });
}

export type VerifyHashResult = ReturnType<typeof makeVerifyHash>;

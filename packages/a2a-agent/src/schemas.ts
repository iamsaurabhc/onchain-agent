import { z } from "zod";

/** 0x-prefixed 32-byte hex string. */
export const hex32 = z
  .string()
  .regex(/^0x[0-9a-fA-F]{64}$/, "expected a 32-byte 0x-hex value");

/** Pluggable normalizer ids (hash-core CodecId). */
export const codecIdSchema = z.enum([
  "raw",
  "jcs",
  "eip712",
  "safetensors",
  "oci-digest",
  "git-oid",
]);

/** Algorithm tag (uint8, §3.1). */
export const algoSchema = z.number().int().min(0).max(255);

/** How a string payload/leaf is decoded to bytes. */
export const encodingSchema = z.enum(["utf8", "hex", "base64"]).default("utf8");

/** A payload as it arrives over JSON. */
export const payloadSchema = z.union([
  z.string(),
  z.record(z.any()),
  z.array(z.any()),
]);

/** Input for the anchor-payload skill. */
export const anchorPayloadInputSchema = z
  .object({
    codecId: codecIdSchema,
    algo: algoSchema,
    encoding: encodingSchema,
    payload: payloadSchema.optional(),
    leaves: z.array(z.string()).optional(),
    salt: hex32.optional(),
    metadataHash: hex32.optional(),
  })
  .refine((v) => v.payload !== undefined || v.leaves !== undefined, {
    message: "provide either payload (direct) or leaves (merkle)",
  });

export type AnchorPayloadInput = z.infer<typeof anchorPayloadInputSchema>;

/** Anchor result returned by anchor-payload skill. */
export const anchorPayloadOutputSchema = z.object({
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

export type AnchorPayloadOutput = z.infer<typeof anchorPayloadOutputSchema>;

const verifyByPayloadSchema = z.object({
  method: z.literal("by_payload"),
  payload: payloadSchema,
  codecId: codecIdSchema,
  algo: algoSchema,
  encoding: encodingSchema,
  salt: hex32.optional(),
  claimedHash: hex32.optional(),
});

const verifyByHashSchema = z.object({
  method: z.literal("by_hash"),
  hash: hex32,
  crossCheckLogs: z.boolean().optional(),
});

const verifyByTxSchema = z.object({
  method: z.literal("by_tx"),
  txHash: hex32,
  expectedHash: hex32.optional(),
});

const verifyByMerkleSchema = z.object({
  method: z.literal("by_merkle"),
  root: hex32,
  proof: z.array(hex32),
  leaf: hex32.optional(),
  leafPayload: z.string().optional(),
  encoding: encodingSchema,
});

const verifyByLogSchema = z.object({
  method: z.literal("by_log"),
  hash: hex32,
});

/** Discriminated input for the verify-anchor skill. */
export const verifyAnchorInputSchema = z
  .discriminatedUnion("method", [
    verifyByPayloadSchema,
    verifyByHashSchema,
    verifyByTxSchema,
    verifyByMerkleSchema,
    verifyByLogSchema,
  ])
  .superRefine((val, ctx) => {
    if (val.method === "by_merkle" && val.leaf === undefined && val.leafPayload === undefined) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "provide either leaf or leafPayload",
        path: ["leaf"],
      });
    }
  });

export type VerifyAnchorInput = z.infer<typeof verifyAnchorInputSchema>;

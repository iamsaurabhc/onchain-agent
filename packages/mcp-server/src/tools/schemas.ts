import { Reason, type VerificationMethod } from "@onchain-agent/anchor-client";
import { z } from "zod";

/** 0x-prefixed 32-byte hex string. */
export const hex32 = z
  .string()
  .regex(/^0x[0-9a-fA-F]{64}$/, "expected a 32-byte 0x-hex value");

/** 0x-prefixed 20-byte address. */
export const address = z
  .string()
  .regex(/^0x[0-9a-fA-F]{40}$/, "expected a 20-byte 0x address");

/** Pluggable normalizer ids (hash-core CodecId). */
export const codecIdSchema = z.enum([
  "raw",
  "jcs",
  "eip712",
  "safetensors",
  "oci-digest",
  "git-oid",
]);

/** Algorithm tag (uint8, §3.1). Validated against known tags in tool logic. */
export const algoSchema = z
  .number()
  .int()
  .min(0)
  .max(255)
  .describe("algorithm tag: 1=keccak256, 2=sha256, 17=keccak-salted, 18=sha-salted, 32=merkle");

/** How a string payload/leaf is decoded to bytes for byte-oriented codecs. */
export const encodingSchema = z
  .enum(["utf8", "hex", "base64"])
  .default("utf8")
  .describe("how a string payload is decoded to bytes (ignored for jcs)");

/** A payload as it arrives over JSON: bytes-as-string, or a structured value. */
export const payloadSchema = z
  .union([z.string(), z.record(z.any()), z.array(z.any())])
  .describe("the payload to hash; a string for byte codecs, an object/array for jcs");

const methodValues = [
  "by_hash",
  "by_payload",
  "by_tx",
  "by_merkle",
  "by_log_scan",
] as const satisfies readonly VerificationMethod[];

const reasonValues = Object.values(Reason) as [Reason, ...Reason[]];

/** §5.1 verification result, as a zod schema for tool outputs. */
export const verificationResultSchema = z.object({
  verified: z.boolean(),
  method: z.enum(methodValues),
  hash: hex32.nullable(),
  anchorer: address.nullable(),
  blockNumber: z.number().nullable(),
  blockTimestamp: z.number().nullable(),
  confirmations: z.number().nullable(),
  chainId: z.number(),
  reason: z.enum(reasonValues).nullable(),
});

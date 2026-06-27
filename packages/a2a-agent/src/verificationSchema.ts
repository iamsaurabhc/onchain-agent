import { Reason, type VerificationMethod } from "@onchain-agent/anchor-client";
import { z } from "zod";
import { hex32 } from "./schemas.js";

const methodValues = [
  "by_hash",
  "by_payload",
  "by_tx",
  "by_merkle",
  "by_log_scan",
] as const satisfies readonly VerificationMethod[];

const reasonValues = Object.values(Reason) as [Reason, ...Reason[]];

/** §5.1 verification result schema (shared by verify-anchor skill output). */
export const verificationResultSchema = z.object({
  verified: z.boolean(),
  method: z.enum(methodValues),
  hash: hex32.nullable(),
  anchorer: z
    .string()
    .regex(/^0x[0-9a-fA-F]{40}$/)
    .nullable(),
  blockNumber: z.number().nullable(),
  blockTimestamp: z.number().nullable(),
  confirmations: z.number().nullable(),
  chainId: z.number(),
  reason: z.enum(reasonValues).nullable(),
});

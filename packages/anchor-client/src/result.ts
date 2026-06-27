import type { Hex32 } from "@onchain-agent/hash-core";

/**
 * Verification reason / error taxonomy (docs/PHASE_ANCHOR_VERIFY.md §5.2).
 *
 * `RPC_ERROR` is *inconclusive*: it must never be collapsed into a definitive
 * `verified: false` "not anchored" meaning (§5.2 final note).
 */
export const Reason = {
  NOT_FOUND: "NOT_FOUND",
  HASH_MISMATCH: "HASH_MISMATCH",
  MERKLE_PROOF_INVALID: "MERKLE_PROOF_INVALID",
  ROOT_NOT_ANCHORED: "ROOT_NOT_ANCHORED",
  INSUFFICIENT_CONFIRMATIONS: "INSUFFICIENT_CONFIRMATIONS",
  REORG: "REORG",
  ALGO_UNSUPPORTED: "ALGO_UNSUPPORTED",
  RPC_ERROR: "RPC_ERROR",
} as const;

export type Reason = (typeof Reason)[keyof typeof Reason];

/** Which verification method produced a result (§5). */
export type VerificationMethod =
  | "by_hash"
  | "by_payload"
  | "by_tx"
  | "by_merkle"
  | "by_log_scan";

/**
 * Machine-readable verification result (docs/PHASE_ANCHOR_VERIFY.md §5.1).
 * Fields are present (possibly null) on every result so the shape is stable.
 */
export interface VerificationResult {
  verified: boolean;
  method: VerificationMethod;
  hash: Hex32 | null;
  anchorer: string | null;
  blockNumber: number | null;
  blockTimestamp: number | null;
  confirmations: number | null;
  chainId: number;
  reason: Reason | null;
}

export interface OkFields {
  method: VerificationMethod;
  hash: Hex32;
  anchorer: string;
  blockNumber: number;
  blockTimestamp: number;
  confirmations: number;
  chainId: number;
}

/** Build a successful (`verified: true`) result. */
export function ok(fields: OkFields): VerificationResult {
  return { verified: true, reason: null, ...fields };
}

export interface FailFields {
  method: VerificationMethod;
  reason: Reason;
  chainId: number;
  hash?: Hex32 | null;
  anchorer?: string | null;
  blockNumber?: number | null;
  blockTimestamp?: number | null;
  confirmations?: number | null;
}

/** Build a failed/inconclusive result with a §5.2 reason. */
export function fail(fields: FailFields): VerificationResult {
  return {
    verified: false,
    method: fields.method,
    hash: fields.hash ?? null,
    anchorer: fields.anchorer ?? null,
    blockNumber: fields.blockNumber ?? null,
    blockTimestamp: fields.blockTimestamp ?? null,
    confirmations: fields.confirmations ?? null,
    chainId: fields.chainId,
    reason: fields.reason,
  };
}

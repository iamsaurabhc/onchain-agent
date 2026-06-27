import {
  AlgoTag,
  CodecId,
  fromHex,
  hashPayload,
  isMerkle,
  isSalted,
  type Hex32,
} from "@onchain-agent/hash-core";
import type { PayloadEncoding, RawPayload } from "@onchain-agent/anchor-client";
import { toPayloadArg } from "@onchain-agent/anchor-client";

/** The zero address that denotes "no record" in the registry. */
export const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";

/** Inputs needed to re-derive a direct (non-Merkle) hash from a payload. */
export interface DeriveInput {
  codecId: CodecId;
  algo: number;
  payload: RawPayload;
  encoding: PayloadEncoding;
  salt?: string;
}

export interface DeriveResult {
  hash: Hex32;
  salt?: `0x${string}`;
}

/**
 * Re-derive a direct hash from a payload using the declared codec + algo.
 * Rejects Merkle (use verifyByMerkle) and requires an explicit salt for
 * salted algos during verification so the result is reproducible.
 */
export function deriveDirectHash(input: DeriveInput, requireSalt: boolean): DeriveResult {
  if (isMerkle(input.algo as AlgoTag)) {
    throw new Error("Merkle algo (0x20) is not a direct hash; use verifyByMerkle");
  }
  if (requireSalt && isSalted(input.algo as AlgoTag) && !input.salt) {
    throw new Error("salt is required to verify a salted algo (0x11/0x12)");
  }

  const payloadArg = toPayloadArg(input.codecId, input.payload, input.encoding);
  const result = hashPayload(payloadArg, {
    codecId: input.codecId as CodecId,
    algo: input.algo as AlgoTag,
    salt: input.salt ? fromHex(input.salt) : undefined,
  });
  return { hash: result.hash, salt: result.salt };
}

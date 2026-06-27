import {
  AlgoTag,
  CodecId,
  fromHex,
  hashPayload,
  isMerkle,
  isSalted,
  type Hex32,
} from "@onchain-agent/hash-core";
import type { Config } from "../config.js";
import { computeConfirmations, isFinal } from "../confirmations.js";
import type { RegistryClient } from "../registryClient.js";
import {
  fail,
  ok,
  Reason,
  type VerificationMethod,
  type VerificationResult,
} from "../result.js";
import { toPayloadArg, type PayloadEncoding, type RawPayload } from "../payload.js";

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
 * Rejects Merkle (use the merkle tool) and requires an explicit salt for
 * salted algos during verification so the result is reproducible.
 */
export function deriveDirectHash(input: DeriveInput, requireSalt: boolean): DeriveResult {
  if (isMerkle(input.algo as AlgoTag)) {
    throw new Error("Merkle algo (0x20) is not a direct hash; use verify_merkle_proof");
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

/**
 * Given an anchored record's block info, compute confirmations and apply the
 * finality gate (§5.6): return a `verified: true` result or
 * `INSUFFICIENT_CONFIRMATIONS`.
 */
export async function finalizeAnchored(args: {
  client: RegistryClient;
  config: Config;
  method: VerificationMethod;
  hash: Hex32;
  anchorer: string;
  blockNumber: bigint;
  blockTimestamp: bigint;
}): Promise<VerificationResult> {
  const head = await args.client.getHeadBlockNumber();
  const confirmations = computeConfirmations(head, args.blockNumber);
  const common = {
    method: args.method,
    hash: args.hash,
    anchorer: args.anchorer,
    blockNumber: Number(args.blockNumber),
    blockTimestamp: Number(args.blockTimestamp),
    confirmations,
    chainId: args.client.chainId,
  };

  if (!isFinal(confirmations, args.config.confirmations)) {
    return fail({ ...common, reason: Reason.INSUFFICIENT_CONFIRMATIONS });
  }
  return ok(common);
}

/** Wrap a verification body so any RPC/transport failure becomes RPC_ERROR (§5.2). */
export async function withRpcErrorBoundary(
  method: VerificationMethod,
  chainId: number,
  body: () => Promise<VerificationResult>,
): Promise<VerificationResult> {
  try {
    return await body();
  } catch (err) {
    return fail({
      method,
      reason: Reason.RPC_ERROR,
      chainId,
    });
  }
}

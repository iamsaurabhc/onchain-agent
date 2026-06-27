import type { Config, RegistryClient } from "@onchain-agent/anchor-client";
import { computeConfirmations, isFinal } from "@onchain-agent/anchor-client";
import type { Hex32 } from "@onchain-agent/hash-core";
import { ok, fail, Reason, type VerificationMethod, type VerificationResult } from "@onchain-agent/anchor-client";

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

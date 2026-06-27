import type { Config, RegistryClient } from "@onchain-agent/anchor-client";
import { fail, Reason, type VerificationResult } from "@onchain-agent/anchor-client";
import type { Hex32 } from "@onchain-agent/hash-core";
import { deriveDirectHash, type DeriveInput, ZERO_ADDRESS } from "../derive.js";
import { finalizeAnchored } from "../finality.js";
import { withRpcErrorBoundary } from "../rpcBoundary.js";

export async function verifyByPayload(
  client: RegistryClient,
  config: Config,
  input: DeriveInput & { claimedHash?: Hex32 },
): Promise<VerificationResult> {
  const { hash } = deriveDirectHash(input, true);

  if (input.claimedHash && input.claimedHash.toLowerCase() !== hash.toLowerCase()) {
    return fail({
      method: "by_payload",
      reason: Reason.HASH_MISMATCH,
      chainId: client.chainId,
      hash,
    });
  }

  return withRpcErrorBoundary("by_payload", client.chainId, async () => {
    const record = await client.getRecord(hash);
    if (record.anchorer.toLowerCase() === ZERO_ADDRESS) {
      return fail({
        method: "by_payload",
        reason: Reason.NOT_FOUND,
        chainId: client.chainId,
        hash,
      });
    }
    return finalizeAnchored({
      client,
      config,
      method: "by_payload",
      hash,
      anchorer: record.anchorer,
      blockNumber: record.blockNumber,
      blockTimestamp: record.blockTimestamp,
    });
  });
}

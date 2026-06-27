import type { Config, RegistryClient } from "@onchain-agent/anchor-client";
import { fail, Reason, type VerificationResult } from "@onchain-agent/anchor-client";
import type { Hex32 } from "@onchain-agent/hash-core";
import { finalizeAnchored } from "../finality.js";
import { withRpcErrorBoundary } from "../rpcBoundary.js";

export async function verifyByTx(
  client: RegistryClient,
  config: Config,
  input: { txHash: Hex32; expectedHash?: Hex32 },
): Promise<VerificationResult> {
  const { txHash, expectedHash } = input;

  return withRpcErrorBoundary("by_tx", client.chainId, async () => {
    const receipt = await client.getTransactionReceipt(txHash);
    if (!receipt) {
      if (expectedHash) {
        return fail({
          method: "by_tx",
          reason: Reason.REORG,
          chainId: client.chainId,
          hash: expectedHash,
        });
      }
      return fail({
        method: "by_tx",
        reason: Reason.NOT_FOUND,
        chainId: client.chainId,
      });
    }

    const logs = await client.parseAnchoredLogs(txHash);
    if (logs.length === 0) {
      return fail({
        method: "by_tx",
        reason: Reason.NOT_FOUND,
        chainId: client.chainId,
      });
    }

    const log = expectedHash
      ? logs.find((l) => l.hash.toLowerCase() === expectedHash.toLowerCase())
      : logs[0];

    if (!log) {
      return fail({
        method: "by_tx",
        reason: Reason.HASH_MISMATCH,
        chainId: client.chainId,
        hash: expectedHash ?? null,
      });
    }

    return finalizeAnchored({
      client,
      config,
      method: "by_tx",
      hash: log.hash,
      anchorer: log.anchorer,
      blockNumber: log.blockNumber,
      blockTimestamp: log.blockTimestamp,
    });
  });
}

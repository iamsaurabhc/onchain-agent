import type { Config, RegistryClient } from "@onchain-agent/anchor-client";
import { fail, Reason, type VerificationResult } from "@onchain-agent/anchor-client";
import type { Hex32 } from "@onchain-agent/hash-core";
import { finalizeAnchored } from "../finality.js";
import { crossCheckRecordVsLog } from "../reorg.js";
import { withRpcErrorBoundary } from "../rpcBoundary.js";
import { ZERO_ADDRESS } from "../derive.js";

export async function verifyByHash(
  client: RegistryClient,
  config: Config,
  input: { hash: Hex32; crossCheckLogs?: boolean },
): Promise<VerificationResult> {
  const hash = input.hash;

  return withRpcErrorBoundary("by_hash", client.chainId, async () => {
    const record = await client.getRecord(hash);
    if (record.anchorer.toLowerCase() === ZERO_ADDRESS) {
      return fail({
        method: "by_hash",
        reason: Reason.NOT_FOUND,
        chainId: client.chainId,
        hash,
      });
    }

    if (input.crossCheckLogs) {
      const logs = await client.getAnchoredLogs(hash);
      const reorg = crossCheckRecordVsLog("by_hash", client.chainId, hash, record, logs);
      if (reorg) return reorg;
    }

    return finalizeAnchored({
      client,
      config,
      method: "by_hash",
      hash,
      anchorer: record.anchorer,
      blockNumber: record.blockNumber,
      blockTimestamp: record.blockTimestamp,
    });
  });
}

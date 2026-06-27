import type { Config, RegistryClient } from "@onchain-agent/anchor-client";
import { fail, Reason, type VerificationResult } from "@onchain-agent/anchor-client";
import type { Hex32 } from "@onchain-agent/hash-core";
import { finalizeAnchored } from "../finality.js";
import { withRpcErrorBoundary } from "../rpcBoundary.js";

/**
 * Verify by independent event-log scan (§5 method 5). Does not trust storage;
 * queries `eth_getLogs` filtered on the indexed hash topic.
 */
export async function verifyByLogScan(
  client: RegistryClient,
  config: Config,
  input: { hash: Hex32 },
): Promise<VerificationResult> {
  const hash = input.hash;

  return withRpcErrorBoundary("by_log_scan", client.chainId, async () => {
    const logs = await client.getAnchoredLogs(hash);
    if (logs.length === 0) {
      return fail({
        method: "by_log_scan",
        reason: Reason.NOT_FOUND,
        chainId: client.chainId,
        hash,
      });
    }

    const log = logs[0];
    return finalizeAnchored({
      client,
      config,
      method: "by_log_scan",
      hash: log.hash,
      anchorer: log.anchorer,
      blockNumber: log.blockNumber,
      blockTimestamp: log.blockTimestamp,
    });
  });
}

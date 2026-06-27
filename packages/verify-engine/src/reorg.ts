import type { AnchoredLog, AnchorRecord } from "@onchain-agent/anchor-client";
import { fail, Reason, type VerificationMethod } from "@onchain-agent/anchor-client";

/** Compare storage record vs log-scan fields; return REORG on mismatch. */
export function crossCheckRecordVsLog(
  method: VerificationMethod,
  chainId: number,
  hash: string,
  record: AnchorRecord,
  logs: AnchoredLog[],
) {
  if (logs.length === 0) {
    return fail({
      method,
      reason: Reason.REORG,
      chainId,
      hash: hash as `0x${string}`,
      anchorer: record.anchorer,
      blockNumber: Number(record.blockNumber),
      blockTimestamp: Number(record.blockTimestamp),
    });
  }

  const log = logs[0];
  const storageMismatch =
    record.anchorer.toLowerCase() !== log.anchorer.toLowerCase() ||
    record.blockNumber !== log.blockNumber ||
    record.blockTimestamp !== log.blockTimestamp;

  if (storageMismatch) {
    return fail({
      method,
      reason: Reason.REORG,
      chainId,
      hash: hash as `0x${string}`,
      anchorer: record.anchorer,
      blockNumber: Number(record.blockNumber),
      blockTimestamp: Number(record.blockTimestamp),
    });
  }

  return null;
}

/**
 * Finality helpers (docs/PHASE_ANCHOR_VERIFY.md §5.6).
 *
 * A record at `blockNumber` has `head - blockNumber + 1` confirmations once the
 * chain head reaches `head` (the block itself counts as the first confirmation).
 */

/** Confirmations for a record's block given the current head. Never negative. */
export function computeConfirmations(head: bigint, blockNumber: bigint): number {
  if (blockNumber > head) return 0;
  return Number(head - blockNumber + 1n);
}

/** True once the record is buried at least `required` deep. */
export function isFinal(confirmations: number, required: number): boolean {
  return confirmations >= required;
}

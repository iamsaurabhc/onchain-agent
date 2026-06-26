/**
 * Algorithm tags (multihash-inspired `uint8`) per docs/PHASE_ANCHOR_VERIFY.md §3.1.
 *
 * The tag is stored on-chain alongside every anchor so verification can
 * deterministically re-derive the hash off-chain.
 */
export const AlgoTag = {
  /** keccak256(payloadBytes) */
  KECCAK256: 0x01,
  /** sha256(payloadBytes) */
  SHA256: 0x02,
  /** keccak256(salt ‖ payloadBytes) */
  KECCAK256_SALTED: 0x11,
  /** sha256(salt ‖ payloadBytes) */
  SHA256_SALTED: 0x12,
  /** keccak256 Merkle root (OpenZeppelin sorted-pair) */
  MERKLE_KECCAK256: 0x20,
} as const;

export type AlgoTag = (typeof AlgoTag)[keyof typeof AlgoTag];

/** Human-readable name for an algo tag (used in diagnostics/fixtures). */
export const ALGO_NAME: Record<AlgoTag, string> = {
  [AlgoTag.KECCAK256]: "keccak256",
  [AlgoTag.SHA256]: "sha256",
  [AlgoTag.KECCAK256_SALTED]: "keccak256-salted",
  [AlgoTag.SHA256_SALTED]: "sha256-salted",
  [AlgoTag.MERKLE_KECCAK256]: "merkle-keccak256",
};

/** True if the tag denotes a salted derivation (salt ‖ payload). */
export function isSalted(algo: AlgoTag): boolean {
  return algo === AlgoTag.KECCAK256_SALTED || algo === AlgoTag.SHA256_SALTED;
}

/** True if the tag denotes a Merkle root rather than a direct hash. */
export function isMerkle(algo: AlgoTag): boolean {
  return algo === AlgoTag.MERKLE_KECCAK256;
}

/**
 * Codec identifiers for the pluggable normalizers (§3.2). Recorded off-chain
 * (optionally bound on-chain via `metadataHash`). These are stable strings.
 */
export const CodecId = {
  RAW: "raw",
  JCS: "jcs",
  EIP712: "eip712",
  SAFETENSORS: "safetensors",
  OCI_DIGEST: "oci-digest",
  GIT_OID: "git-oid",
} as const;

export type CodecId = (typeof CodecId)[keyof typeof CodecId];

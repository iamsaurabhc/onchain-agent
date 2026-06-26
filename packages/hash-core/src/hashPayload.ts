import { AlgoTag, CodecId, isMerkle, isSalted } from "./algoTags.js";
import { keccak256, sha256 } from "./algorithms.js";
import type { Hex32 } from "./algorithms.js";
import { toHex } from "./bytes.js";
import { normalizeJcs, normalizeRaw } from "./normalizers/index.js";
import {
  normalizeEip712,
  normalizeGitOid,
  normalizeOciDigest,
  normalizeSafetensors,
} from "./normalizers/stubs.js";
import { generateSalt, saltedConcat } from "./salt.js";

export interface HashOptions {
  /** Which normalizer maps the payload to canonical bytes. */
  codecId: CodecId;
  /** Which hash algorithm / derivation mode to apply. */
  algo: AlgoTag;
  /**
   * Salt for salted algos (0x11/0x12). If omitted for a salted algo, a fresh
   * 32-byte CSPRNG salt is generated. Ignored for unsalted algos.
   */
  salt?: Uint8Array;
}

export interface HashResult {
  codecId: CodecId;
  algo: AlgoTag;
  /** Present only for salted algos; 0x-prefixed hex of the salt bytes. */
  salt?: `0x${string}`;
  /** 0x-prefixed 32-byte hash. */
  hash: Hex32;
}

/** Map a payload + codec to the canonical bytes that get hashed. */
function normalize(codecId: CodecId, payload: unknown): Uint8Array {
  switch (codecId) {
    case CodecId.RAW:
      return normalizeRaw(payload as Uint8Array);
    case CodecId.JCS:
      return normalizeJcs(payload);
    case CodecId.EIP712:
      return normalizeEip712(payload);
    case CodecId.SAFETENSORS:
      return normalizeSafetensors(payload as Uint8Array);
    case CodecId.OCI_DIGEST:
      return normalizeOciDigest(payload as string);
    case CodecId.GIT_OID:
      return normalizeGitOid(payload as string);
    default:
      throw new Error(`unknown codecId: ${codecId as string}`);
  }
}

/** Apply the raw (unsalted) hash for an algo's hash family. */
function directHash(algo: AlgoTag, bytes: Uint8Array): Hex32 {
  switch (algo) {
    case AlgoTag.KECCAK256:
    case AlgoTag.KECCAK256_SALTED:
    case AlgoTag.MERKLE_KECCAK256:
      return keccak256(bytes);
    case AlgoTag.SHA256:
    case AlgoTag.SHA256_SALTED:
      return sha256(bytes);
    default:
      throw new Error(`unsupported algo: ${String(algo)}`);
  }
}

/**
 * Main Phase A API. Normalizes the payload via the chosen codec, then derives
 * the hash per the algo tag, returning the off-chain record shape
 * `{ codecId, algo, salt?, hash }` (§7).
 *
 * Merkle (0x20) is not derived here — a Merkle root commits *many* leaves and
 * is built via the `merkle` module; see `buildRoot`.
 */
export function hashPayload(payload: unknown, opts: HashOptions): HashResult {
  if (isMerkle(opts.algo)) {
    throw new Error(
      "hashPayload does not handle Merkle roots (0x20); use the merkle module (buildRoot) over many leaves",
    );
  }

  const canonical = normalize(opts.codecId, payload);

  if (isSalted(opts.algo)) {
    const salt = opts.salt ?? generateSalt();
    const preimage = saltedConcat(salt, canonical);
    return {
      codecId: opts.codecId,
      algo: opts.algo,
      salt: toHex(salt),
      hash: directHash(opts.algo, preimage),
    };
  }

  return {
    codecId: opts.codecId,
    algo: opts.algo,
    hash: directHash(opts.algo, canonical),
  };
}

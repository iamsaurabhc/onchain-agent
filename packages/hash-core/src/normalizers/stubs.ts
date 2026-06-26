import { NotImplementedError } from "../errors.js";

/**
 * EIP-712 typed-data hashing (§3.2). Uses keccak256 of `hashStruct` by
 * definition. Deferred past Phase A.
 *
 * TODO(phase-later): implement with viem's `hashTypedData` (domain + types +
 * message), returning the 32-byte digest directly (this codec is hash-producing,
 * not byte-producing, unlike raw/jcs).
 */
export function normalizeEip712(_value: unknown): never {
  throw new NotImplementedError("eip712 normalizer");
}

/**
 * safetensors digest adopter (§3.2): adopt the artifact's own canonical digest.
 * TODO(phase-later): parse the safetensors header/byte-buffer layout and adopt
 * its native digest as the anchored hash.
 */
export function normalizeSafetensors(_input: Uint8Array): never {
  throw new NotImplementedError("safetensors normalizer");
}

/**
 * OCI image digest adopter (§3.2).
 * TODO(phase-later): accept a registry digest (e.g. `sha256:...`) and adopt it
 * directly rather than re-hashing image bytes.
 */
export function normalizeOciDigest(_digest: string): never {
  throw new NotImplementedError("oci-digest normalizer");
}

/**
 * git object id adopter (§3.2).
 * TODO(phase-later): adopt a git commit/tree oid (sha1/sha256 object id) as the
 * anchored hash.
 */
export function normalizeGitOid(_oid: string): never {
  throw new NotImplementedError("git-oid normalizer");
}

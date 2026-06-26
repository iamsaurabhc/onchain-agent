import { MerkleTree } from "merkletreejs";
import { keccak256 } from "./algorithms.js";
import type { Hex32 } from "./algorithms.js";
import { fromHex, toHex } from "./bytes.js";

/**
 * Keccak Merkle tree using OpenZeppelin's sorted-pair convention (§3.4) so that
 * proofs built off-chain are accepted by `MerkleProof.verify` on-chain.
 *
 * - Leaf encoding is fixed: `leaf = keccak256(canonicalLeafBytes)`.
 * - Internal nodes hash the *sorted* concatenation of the child pair.
 */

/** Hash function for internal nodes: keccak256 over a Buffer, returning Buffer. */
function keccakBuf(data: Buffer): Buffer {
  return Buffer.from(fromHex(keccak256(new Uint8Array(data))));
}

/** Compute a leaf hash from canonical leaf bytes. */
export function leafHash(canonicalLeafBytes: Uint8Array): Hex32 {
  return keccak256(canonicalLeafBytes);
}

function buildTree(leaves: Hex32[]): MerkleTree {
  const leafBuffers = leaves.map((l) => Buffer.from(fromHex(l)));
  return new MerkleTree(leafBuffers, keccakBuf, {
    sortPairs: true,
    // leaves are already hashed; do not hash them again
    hashLeaves: false,
  });
}

/** Build the Merkle root over pre-hashed leaves. */
export function buildRoot(leaves: Hex32[]): Hex32 {
  if (leaves.length === 0) throw new Error("merkle: cannot build root of empty leaf set");
  const tree = buildTree(leaves);
  return toHex(new Uint8Array(tree.getRoot())) as Hex32;
}

/** Get the sorted-pair proof (array of sibling hashes) for a given leaf. */
export function getProof(leaves: Hex32[], leaf: Hex32): Hex32[] {
  const tree = buildTree(leaves);
  const proof = tree.getProof(Buffer.from(fromHex(leaf)));
  return proof.map((p) => toHex(new Uint8Array(p.data)) as Hex32);
}

/**
 * Verify a leaf against a root with its proof, using the sorted-pair rule.
 * Mirrors OpenZeppelin's `MerkleProof.verify`.
 */
export function verify(leaf: Hex32, root: Hex32, proof: Hex32[]): boolean {
  let computed = fromHex(leaf);
  for (const sibling of proof) {
    const sib = fromHex(sibling);
    const [a, b] = compareBytes(computed, sib) <= 0 ? [computed, sib] : [sib, computed];
    const concat = new Uint8Array(a.length + b.length);
    concat.set(a, 0);
    concat.set(b, a.length);
    computed = fromHex(keccak256(concat));
  }
  return toHex(computed) === root.toLowerCase();
}

/** Lexicographic byte comparison (for sorted-pair ordering). */
function compareBytes(a: Uint8Array, b: Uint8Array): number {
  const len = Math.min(a.length, b.length);
  for (let i = 0; i < len; i++) {
    if (a[i] !== b[i]) return a[i] - b[i];
  }
  return a.length - b.length;
}

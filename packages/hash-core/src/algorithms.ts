import { createHash } from "node:crypto";
import { keccak256 as viemKeccak256 } from "viem";

/** 0x-prefixed lowercase hex string of 32 bytes. */
export type Hex32 = `0x${string}`;

/**
 * keccak256 over raw bytes. Uses viem's keccak256, which matches Solidity's
 * `keccak256(bytes)` exactly (no ABI-encoding wrapping). This identity is the
 * core parity requirement of Phase A (§3.5).
 */
export function keccak256(bytes: Uint8Array): Hex32 {
  return viemKeccak256(bytes) as Hex32;
}

/**
 * sha256 over raw bytes via node:crypto, returned as a 0x-prefixed hex string
 * so it shares the on-wire shape of keccak256 outputs and Solidity's
 * `sha256(bytes)` precompile result.
 */
export function sha256(bytes: Uint8Array): Hex32 {
  const digest = createHash("sha256").update(bytes).digest("hex");
  return `0x${digest}` as Hex32;
}

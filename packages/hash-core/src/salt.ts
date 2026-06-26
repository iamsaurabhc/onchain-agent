import { randomBytes } from "node:crypto";

/** Default salt length in bytes (§3.3): 32-byte CSPRNG salt. */
export const SALT_BYTES = 32;

/** Generate a fresh CSPRNG salt (default 32 bytes). */
export function generateSalt(length: number = SALT_BYTES): Uint8Array {
  return new Uint8Array(randomBytes(length));
}

/**
 * Salted pre-image: `salt ‖ payloadBytes` (concatenate, then hash). The
 * Solidity side reproduces this with `abi.encodePacked(salt, payload)`, which
 * is a plain byte concatenation — so the bytes hashed are identical (§3.3).
 */
export function saltedConcat(salt: Uint8Array, payload: Uint8Array): Uint8Array {
  const out = new Uint8Array(salt.length + payload.length);
  out.set(salt, 0);
  out.set(payload, salt.length);
  return out;
}

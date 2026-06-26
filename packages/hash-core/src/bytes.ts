import type { Hex32 } from "./algorithms.js";

/** Convert a Uint8Array to a 0x-prefixed lowercase hex string. */
export function toHex(bytes: Uint8Array): `0x${string}` {
  let hex = "";
  for (const b of bytes) hex += b.toString(16).padStart(2, "0");
  return `0x${hex}`;
}

/** Convert a 0x-prefixed (or bare) hex string to a Uint8Array. */
export function fromHex(hex: string): Uint8Array {
  const clean = hex.startsWith("0x") ? hex.slice(2) : hex;
  if (clean.length % 2 !== 0) throw new Error(`invalid hex length: ${hex}`);
  const out = new Uint8Array(clean.length / 2);
  for (let i = 0; i < out.length; i++) {
    out[i] = parseInt(clean.slice(i * 2, i * 2 + 2), 16);
  }
  return out;
}

/** UTF-8 encode a string to bytes. */
export function utf8(text: string): Uint8Array {
  return new TextEncoder().encode(text);
}

/** Assert that a hex string represents exactly 32 bytes. */
export function assertHex32(hex: string): Hex32 {
  if (!/^0x[0-9a-f]{64}$/.test(hex)) {
    throw new Error(`expected 32-byte 0x-hex, got: ${hex}`);
  }
  return hex as Hex32;
}

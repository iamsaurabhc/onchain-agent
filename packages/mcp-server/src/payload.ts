import { Buffer } from "node:buffer";
import { CodecId, utf8 } from "@onchain-agent/hash-core";

/** How a string payload/leaf is encoded into bytes for byte-oriented codecs. */
export type PayloadEncoding = "utf8" | "hex" | "base64";

/** A payload as it arrives over MCP (JSON): bytes-as-string, or a JSON value. */
export type RawPayload = string | Record<string, unknown> | unknown[];

/** Decode a string into bytes per the declared encoding. */
export function decodeBytes(value: string, encoding: PayloadEncoding): Uint8Array {
  switch (encoding) {
    case "utf8":
      return utf8(value);
    case "hex": {
      const clean = value.startsWith("0x") ? value.slice(2) : value;
      if (clean.length % 2 !== 0) throw new Error(`invalid hex payload length`);
      return new Uint8Array(Buffer.from(clean, "hex"));
    }
    case "base64":
      return new Uint8Array(Buffer.from(value, "base64"));
    default:
      throw new Error(`unknown payload encoding: ${encoding as string}`);
  }
}

/**
 * Map an MCP-supplied payload to the argument shape `hashPayload` expects for a
 * given codec. JSON codecs (jcs) take the parsed value directly; byte codecs
 * take decoded bytes from a string payload.
 */
export function toPayloadArg(
  codecId: CodecId,
  payload: RawPayload,
  encoding: PayloadEncoding,
): unknown {
  if (codecId === CodecId.JCS) {
    if (typeof payload === "string") {
      // Allow a JSON string to be passed for jcs; parse it to an object/array.
      return JSON.parse(payload);
    }
    return payload;
  }

  // All other codecs are byte-oriented (raw and the digest adopters).
  if (typeof payload !== "string") {
    throw new Error(`codec '${codecId}' requires a string payload (got ${typeof payload})`);
  }
  return decodeBytes(payload, encoding);
}

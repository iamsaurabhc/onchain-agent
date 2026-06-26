import canonicalize from "canonicalize";

/**
 * `jcs` normalizer (§3.2): RFC 8785 JSON Canonicalization Scheme. Produces the
 * exact UTF-8 bytes that get hashed, so `{a:1,b:2}` and `{b:2,a:1}` yield an
 * identical hash regardless of key order or insignificant whitespace.
 *
 * Idempotence/stability is guaranteed by JCS: canonicalizing already-canonical
 * JSON yields the same string, and parse→canonicalize is platform-stable.
 */
export function normalizeJcs(value: unknown): Uint8Array {
  const canonical = canonicalize(value);
  if (canonical === undefined) {
    throw new TypeError("jcs: value is not JSON-serializable (got undefined)");
  }
  return new TextEncoder().encode(canonical);
}

/** Convenience: canonicalize a JSON string by parsing then JCS-encoding it. */
export function normalizeJcsString(json: string): Uint8Array {
  return normalizeJcs(JSON.parse(json));
}

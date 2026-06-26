/**
 * `raw` normalizer (§3.2): bytes are used exactly as-is. For files, media,
 * binaries, and caller-supplied digests where the byte stream IS the canonical
 * form.
 *
 * Idempotence is trivial: normalize(normalize(x)) === normalize(x) since the
 * function returns the input bytes unchanged (copied to avoid aliasing).
 */
export function normalizeRaw(input: Uint8Array): Uint8Array {
  return Uint8Array.from(input);
}

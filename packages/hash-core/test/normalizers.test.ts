import { describe, expect, it } from "vitest";
import { keccak256 } from "../src/algorithms.js";
import { normalizeJcs, normalizeRaw } from "../src/normalizers/index.js";
import {
  normalizeEip712,
  normalizeGitOid,
  normalizeOciDigest,
  normalizeSafetensors,
} from "../src/normalizers/stubs.js";
import { NotImplementedError } from "../src/errors.js";
import { toHex } from "../src/bytes.js";

describe("raw normalizer", () => {
  it("returns identical bytes", () => {
    const input = new Uint8Array([0, 1, 2, 255, 128]);
    expect(toHex(normalizeRaw(input))).toBe(toHex(input));
  });

  it("is idempotent and does not alias the input", () => {
    const input = new Uint8Array([9, 8, 7]);
    const once = normalizeRaw(input);
    const twice = normalizeRaw(once);
    expect(toHex(twice)).toBe(toHex(once));
    once[0] = 42;
    expect(input[0]).toBe(9); // mutation of output must not affect input
  });
});

describe("jcs normalizer (RFC 8785)", () => {
  it("is key-order independent", () => {
    const a = normalizeJcs({ a: 1, b: 2, c: { x: 10, y: 20 } });
    const b = normalizeJcs({ c: { y: 20, x: 10 }, b: 2, a: 1 });
    expect(toHex(a)).toBe(toHex(b));
    expect(keccak256(a)).toBe(keccak256(b));
  });

  it("is idempotent: canonicalizing canonical JSON yields the same bytes", () => {
    const value = { z: [3, 2, 1], a: "hello", n: 42 };
    const once = normalizeJcs(value);
    const reparsed = JSON.parse(new TextDecoder().decode(once));
    const twice = normalizeJcs(reparsed);
    expect(toHex(twice)).toBe(toHex(once));
  });

  it("produces the canonical RFC 8785 form for a known object", () => {
    const bytes = normalizeJcs({ b: 2, a: 1 });
    expect(new TextDecoder().decode(bytes)).toBe('{"a":1,"b":2}');
  });
});

describe("stub normalizers throw NotImplementedError", () => {
  it("eip712", () => {
    expect(() => normalizeEip712({})).toThrow(NotImplementedError);
  });
  it("safetensors", () => {
    expect(() => normalizeSafetensors(new Uint8Array())).toThrow(NotImplementedError);
  });
  it("oci-digest", () => {
    expect(() => normalizeOciDigest("sha256:deadbeef")).toThrow(NotImplementedError);
  });
  it("git-oid", () => {
    expect(() => normalizeGitOid("abc123")).toThrow(NotImplementedError);
  });
});

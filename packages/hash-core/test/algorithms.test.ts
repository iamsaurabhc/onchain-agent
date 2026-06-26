import { describe, expect, it } from "vitest";
import { keccak256, sha256 } from "../src/algorithms.js";
import { utf8 } from "../src/bytes.js";

describe("keccak256 known vectors", () => {
  it("hashes the empty input", () => {
    expect(keccak256(new Uint8Array())).toBe(
      "0xc5d2460186f7233c927e7db2dcc703c0e500b653ca82273b7bfad8045d85a470",
    );
  });

  it('hashes "hello"', () => {
    expect(keccak256(utf8("hello"))).toBe(
      "0x1c8aff950685c2ed4bc3174f3472287b56d9517b9c948127319a09a7a36deac8",
    );
  });
});

describe("sha256 known vectors", () => {
  it("hashes the empty input", () => {
    expect(sha256(new Uint8Array())).toBe(
      "0xe3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
    );
  });

  it('hashes "hello"', () => {
    expect(sha256(utf8("hello"))).toBe(
      "0x2cf24dba5fb0a30e26e83b2ac5b9e29e1b161e5c1fa7425e73043362938b9824",
    );
  });
});

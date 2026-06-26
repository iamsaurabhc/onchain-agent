import { describe, expect, it } from "vitest";
import { AlgoTag, CodecId } from "../src/algoTags.js";
import { keccak256 } from "../src/algorithms.js";
import { fromHex } from "../src/bytes.js";
import { hashPayload } from "../src/hashPayload.js";
import { generateSalt, SALT_BYTES, saltedConcat } from "../src/salt.js";

describe("salt", () => {
  it("generateSalt returns 32 bytes by default and is random", () => {
    const a = generateSalt();
    const b = generateSalt();
    expect(a.length).toBe(SALT_BYTES);
    expect(toHexLocal(a)).not.toBe(toHexLocal(b));
  });

  it("saltedConcat equals salt ‖ payload (matches abi.encodePacked)", () => {
    const salt = new Uint8Array([1, 2]);
    const payload = new Uint8Array([3, 4, 5]);
    expect([...saltedConcat(salt, payload)]).toEqual([1, 2, 3, 4, 5]);
  });

  it("salted hashing is deterministic for a fixed salt", () => {
    const payload = new Uint8Array([10, 20, 30]);
    const salt = fromHex("0x" + "ab".repeat(32));
    const r1 = hashPayload(payload, { codecId: CodecId.RAW, algo: AlgoTag.KECCAK256_SALTED, salt });
    const r2 = hashPayload(payload, { codecId: CodecId.RAW, algo: AlgoTag.KECCAK256_SALTED, salt });
    expect(r1.hash).toBe(r2.hash);
    // and equals the explicit concat hash
    expect(r1.hash).toBe(keccak256(saltedConcat(salt, payload)));
  });

  it("different salts produce different hashes for the same payload", () => {
    const payload = new Uint8Array([10, 20, 30]);
    const r1 = hashPayload(payload, {
      codecId: CodecId.RAW,
      algo: AlgoTag.KECCAK256_SALTED,
      salt: fromHex("0x" + "11".repeat(32)),
    });
    const r2 = hashPayload(payload, {
      codecId: CodecId.RAW,
      algo: AlgoTag.KECCAK256_SALTED,
      salt: fromHex("0x" + "22".repeat(32)),
    });
    expect(r1.hash).not.toBe(r2.hash);
  });
});

function toHexLocal(b: Uint8Array): string {
  return Buffer.from(b).toString("hex");
}

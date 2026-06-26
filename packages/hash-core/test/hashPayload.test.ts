import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { AlgoTag, CodecId } from "../src/algoTags.js";
import { fromHex } from "../src/bytes.js";
import { hashPayload } from "../src/hashPayload.js";
import { FIXTURES } from "./_paths.js";

interface ManifestEntry {
  name: string;
  codecId: string;
  algo: number;
  salted: boolean;
}
interface Manifest {
  payloads: ManifestEntry[];
}
interface Expected {
  codecId: string;
  algo: number;
  salt?: string;
  hash: string;
}

const manifest: Manifest = JSON.parse(
  readFileSync(join(FIXTURES, "manifest.json"), "utf8"),
);

describe("golden regression — every fixture re-derives to its golden hash", () => {
  for (const entry of manifest.payloads) {
    it(`${entry.name} (${entry.codecId} / algo 0x${entry.algo.toString(16)})`, () => {
      const expected: Expected = JSON.parse(
        readFileSync(join(FIXTURES, "expected", `${entry.name}.json`), "utf8"),
      );
      const diskBytes = new Uint8Array(
        readFileSync(join(FIXTURES, "payloads", entry.name)),
      );

      // jcs payloads are stored canonicalized on disk, so parsing then
      // re-canonicalizing reproduces identical bytes.
      const payloadArg =
        entry.codecId === CodecId.JCS
          ? JSON.parse(new TextDecoder().decode(diskBytes))
          : diskBytes;

      const result = hashPayload(payloadArg, {
        codecId: entry.codecId as CodecId,
        algo: entry.algo as AlgoTag,
        salt: expected.salt ? fromHex(expected.salt) : undefined,
      });

      expect(result.hash).toBe(expected.hash);
      expect(result.algo).toBe(expected.algo);
      expect(result.codecId).toBe(expected.codecId);
      if (expected.salt) expect(result.salt).toBe(expected.salt);
    });
  }
});

describe("hashPayload guards", () => {
  it("rejects Merkle algo (0x20)", () => {
    expect(() =>
      hashPayload(new Uint8Array([1]), {
        codecId: CodecId.RAW,
        algo: AlgoTag.MERKLE_KECCAK256,
      }),
    ).toThrow(/Merkle/);
  });

  it("auto-generates a 32-byte salt when none supplied for a salted algo", () => {
    const r = hashPayload(new Uint8Array([1, 2, 3]), {
      codecId: CodecId.RAW,
      algo: AlgoTag.KECCAK256_SALTED,
    });
    expect(r.salt).toMatch(/^0x[0-9a-f]{64}$/);
  });
});

import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { keccak256 } from "../src/algorithms.js";
import { normalizeJcs } from "../src/normalizers/index.js";
import * as merkle from "../src/merkle.js";
import { toHex, utf8 } from "../src/bytes.js";
import type { Hex32 } from "../src/algorithms.js";

const HEX32 = /^0x[0-9a-f]{64}$/;

describe("fuzz: keccak256 sanity", () => {
  it("produces a 32-byte hex digest and is deterministic", () => {
    fc.assert(
      fc.property(fc.uint8Array(), (bytes) => {
        const h1 = keccak256(bytes);
        const h2 = keccak256(Uint8Array.from(bytes));
        expect(h1).toMatch(HEX32);
        expect(h1).toBe(h2);
      }),
    );
  });

  it("is collision-resistant for distinct single-byte appends (no trivial clashes)", () => {
    fc.assert(
      fc.property(fc.uint8Array({ minLength: 1 }), (bytes) => {
        const extended = new Uint8Array(bytes.length + 1);
        extended.set(bytes, 0);
        extended[bytes.length] = 0;
        expect(keccak256(bytes)).not.toBe(keccak256(extended));
      }),
    );
  });
});

describe("fuzz: JCS canonicalization is key-order stable", () => {
  it("shuffling object keys yields identical canonical bytes", () => {
    const jsonValue = fc.dictionary(
      fc.string(),
      fc.oneof(fc.integer(), fc.boolean(), fc.string()),
      { minKeys: 1, maxKeys: 8 },
    );
    fc.assert(
      fc.property(jsonValue, (obj) => {
        const keys = Object.keys(obj);
        const shuffled: Record<string, unknown> = {};
        for (const k of [...keys].reverse()) shuffled[k] = obj[k];
        expect(toHex(normalizeJcs(shuffled))).toBe(toHex(normalizeJcs(obj)));
      }),
    );
  });
});

describe("fuzz: random Merkle trees — membership & non-membership", () => {
  it("every member verifies; a non-member never does", () => {
    fc.assert(
      fc.property(
        fc.uniqueArray(fc.uint8Array({ minLength: 1, maxLength: 16 }), {
          minLength: 1,
          maxLength: 32,
          selector: (a) => toHex(a),
        }),
        fc.uint8Array({ minLength: 1, maxLength: 16 }),
        (members, candidate) => {
          const leaves = members.map((m) => merkle.leafHash(m));
          const leafSet = new Set<string>(leaves);
          const root = merkle.buildRoot(leaves);

          for (const leaf of leaves) {
            const proof = merkle.getProof(leaves, leaf);
            expect(merkle.verify(leaf, root, proof)).toBe(true);
          }

          const candidateLeaf = merkle.leafHash(candidate);
          if (!leafSet.has(candidateLeaf)) {
            // try to verify the non-member with an arbitrary member's proof
            const anyProof = merkle.getProof(leaves, leaves[0]);
            expect(merkle.verify(candidateLeaf, root, anyProof)).toBe(false);
          }
        },
      ),
    );
  });
});

describe("merkle edge sizes: single leaf and odd trees", () => {
  it("size-1 tree: root == leaf and empty proof verifies", () => {
    const leaf = merkle.leafHash(utf8("only-leaf"));
    expect(merkle.buildRoot([leaf])).toBe(leaf);
    expect(merkle.getProof([leaf], leaf)).toEqual([]);
    expect(merkle.verify(leaf, leaf, [])).toBe(true);
  });

  it("odd-sized tree (3 leaves): every member verifies, carry-odd leaf has a short proof", () => {
    const leaves = [
      merkle.leafHash(utf8("a")),
      merkle.leafHash(utf8("b")),
      merkle.leafHash(utf8("c")),
    ];
    const root = merkle.buildRoot(leaves);
    for (const leaf of leaves) {
      expect(merkle.verify(leaf, root, merkle.getProof(leaves, leaf))).toBe(true);
    }
    // The trailing odd leaf is carried up, so its proof is shorter than a full path.
    expect(merkle.getProof(leaves, leaves[2]).length).toBe(1);
  });
});

describe("fuzz: leaf hashing matches keccak256 of leaf bytes", () => {
  it("leafHash(x) === keccak256(x)", () => {
    fc.assert(
      fc.property(fc.string(), (s) => {
        const bytes = utf8(s);
        expect(merkle.leafHash(bytes)).toBe(keccak256(bytes) as Hex32);
      }),
    );
  });
});

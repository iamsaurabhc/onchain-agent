import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { utf8 } from "../src/bytes.js";
import * as merkle from "../src/merkle.js";
import type { Hex32 } from "../src/algorithms.js";
import { FIXTURES } from "./_paths.js";

interface Batch {
  leaves: Hex32[];
  root: Hex32;
  proofs: Record<string, Hex32[]>;
}

const batch: Batch = JSON.parse(
  readFileSync(join(FIXTURES, "merkle", "batch1.json"), "utf8"),
);

describe("merkle golden batch", () => {
  it("rebuilds the same root from the golden leaves", () => {
    expect(merkle.buildRoot(batch.leaves)).toBe(batch.root);
  });

  it("every member verifies with its golden proof (membership soundness)", () => {
    for (const leaf of batch.leaves) {
      expect(merkle.verify(leaf, batch.root, batch.proofs[leaf])).toBe(true);
    }
  });

  it("regenerated proofs match the golden proofs", () => {
    for (const leaf of batch.leaves) {
      expect(merkle.getProof(batch.leaves, leaf)).toEqual(batch.proofs[leaf]);
    }
  });

  it("a non-member leaf never verifies", () => {
    const fake = merkle.leafHash(utf8("not-in-the-tree"));
    const someProof = batch.proofs[batch.leaves[0]];
    expect(merkle.verify(fake, batch.root, someProof)).toBe(false);
  });

  it("a tampered proof fails", () => {
    const leaf = batch.leaves[0];
    const proof = [...batch.proofs[leaf]];
    if (proof.length > 0) {
      proof[0] = ("0x" + "ff".repeat(32)) as Hex32;
      expect(merkle.verify(leaf, batch.root, proof)).toBe(false);
    }
  });
});

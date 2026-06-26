import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import * as merkle from "../src/merkle.js";
import type { Hex32 } from "../src/algorithms.js";
import { FIXTURES } from "./_paths.js";

interface Tree {
  leaves: Hex32[];
  root: Hex32;
  proofs: Record<string, Hex32[]>;
  nonMembers: Hex32[];
}

interface TreeManifest {
  count: number;
  trees: { file: string; size: number }[];
}

const MERKLE_DIR = join(FIXTURES, "merkle");
const manifest: TreeManifest = JSON.parse(
  readFileSync(join(MERKLE_DIR, "manifest.json"), "utf8"),
);

function loadTree(file: string): Tree {
  return JSON.parse(readFileSync(join(MERKLE_DIR, file), "utf8"));
}

describe("merkle golden trees", () => {
  for (const { file, size } of manifest.trees) {
    describe(`${file} (size ${size})`, () => {
      const tree = loadTree(file);

      it("rebuilds the same root from the golden leaves", () => {
        expect(merkle.buildRoot(tree.leaves)).toBe(tree.root);
      });

      it("every member verifies with its golden proof (membership soundness)", () => {
        for (const leaf of tree.leaves) {
          expect(merkle.verify(leaf, tree.root, tree.proofs[leaf])).toBe(true);
        }
      });

      it("regenerated proofs match the golden proofs", () => {
        for (const leaf of tree.leaves) {
          expect(merkle.getProof(tree.leaves, leaf)).toEqual(tree.proofs[leaf]);
        }
      });

      it("no declared non-member ever verifies", () => {
        const someProof = tree.proofs[tree.leaves[0]];
        for (const nonMember of tree.nonMembers) {
          expect(merkle.verify(nonMember, tree.root, someProof)).toBe(false);
        }
      });

      it("a tampered proof fails", () => {
        const leaf = tree.leaves[0];
        const proof = [...tree.proofs[leaf]];
        if (proof.length > 0) {
          proof[0] = ("0x" + "ff".repeat(32)) as Hex32;
          expect(merkle.verify(leaf, tree.root, proof)).toBe(false);
        } else {
          // size-1 tree: any non-empty proof must break verification.
          const fakeProof = [("0x" + "ff".repeat(32)) as Hex32];
          expect(merkle.verify(leaf, tree.root, fakeProof)).toBe(false);
        }
      });
    });
  }
});

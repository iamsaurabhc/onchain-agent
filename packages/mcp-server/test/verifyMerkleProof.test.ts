import { describe, expect, it } from "vitest";
import type { Hex32 } from "@onchain-agent/hash-core";
import { createTools } from "../src/tools/index.js";
import { FakeRegistry } from "@onchain-agent/anchor-client/test/fakeRegistry";
import { runTool, testConfig } from "./helpers/run.js";

// Tree over utf8 leaves "a","b","c","d" (hash-core sorted-pair convention).
const ROOT = "0x68203f90e9d07dc5859259d7536e87a6ba9d345f2552b5b9de2999ddce9ce1bf" as Hex32;
const LEAF_A = "0x3ac225168df54212a25c1c01fd35bebfea408fdac2e31ddd6f80a4bbf9a5f1cb" as Hex32;
const PROOF_A = [
  "0xb5553de315e0edf504d9150af82dafa5c4667fa618ed0a6f19c69b41166c5510",
  "0xd253a52d4cb00de2895e85f2529e2976e6aaaa5c18106b68ab66813e14415669",
] as Hex32[];
const NON_MEMBER = "0x41e406698d040bb44cf693b3dc50c37cf3c854c422d2645b1101662741fbaa88" as Hex32;

function anchoredRootRegistry(): FakeRegistry {
  const client = new FakeRegistry({ head: 100n });
  client.seed({ hash: ROOT, algo: 0x20, isMerkleRoot: true, blockNumber: 100, blockTimestamp: 1750000000 });
  return client;
}

describe("verify_merkle_proof", () => {
  it("verifies a member leaf against an anchored root (by_merkle)", async () => {
    const tools = createTools(anchoredRootRegistry(), testConfig({ confirmations: 1 }));

    const result = await runTool(tools.verify_merkle_proof, {
      root: ROOT,
      leaf: LEAF_A,
      proof: PROOF_A,
    });

    expect(result.verified).toBe(true);
    expect(result.method).toBe("by_merkle");
    expect(result.hash).toBe(ROOT);
    expect(result.confirmations).toBe(1);
  });

  it("derives the leaf from leafPayload bytes", async () => {
    const tools = createTools(anchoredRootRegistry(), testConfig({ confirmations: 1 }));

    const result = await runTool(tools.verify_merkle_proof, {
      root: ROOT,
      leafPayload: "a",
      encoding: "utf8",
      proof: PROOF_A,
    });

    expect(result.verified).toBe(true);
  });

  it("returns MERKLE_PROOF_INVALID for a non-member leaf", async () => {
    const tools = createTools(anchoredRootRegistry(), testConfig());

    const result = await runTool(tools.verify_merkle_proof, {
      root: ROOT,
      leaf: NON_MEMBER,
      proof: PROOF_A,
    });

    expect(result.verified).toBe(false);
    expect(result.reason).toBe("MERKLE_PROOF_INVALID");
  });

  it("returns ROOT_NOT_ANCHORED when the proof is valid but the root was never anchored", async () => {
    const client = new FakeRegistry({ head: 100n }); // root not seeded
    const tools = createTools(client, testConfig());

    const result = await runTool(tools.verify_merkle_proof, {
      root: ROOT,
      leaf: LEAF_A,
      proof: PROOF_A,
    });

    expect(result.verified).toBe(false);
    expect(result.reason).toBe("ROOT_NOT_ANCHORED");
  });

  it("returns RPC_ERROR on transport failure", async () => {
    const client = anchoredRootRegistry();
    client.throwOnRead = true;
    const tools = createTools(client, testConfig());

    const result = await runTool(tools.verify_merkle_proof, {
      root: ROOT,
      leaf: LEAF_A,
      proof: PROOF_A,
    });

    expect(result.verified).toBe(false);
    expect(result.reason).toBe("RPC_ERROR");
  });
});

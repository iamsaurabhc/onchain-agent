import { describe, expect, it } from "vitest";
import type { Hex32 } from "@onchain-agent/hash-core";
import { createTools } from "../src/tools/index.js";
import { FAKE_ANCHORER, FakeRegistry } from "./helpers/fakeRegistry.js";
import { runTool, testConfig } from "./helpers/run.js";

const HELLO_HASH = "0x1c8aff950685c2ed4bc3174f3472287b56d9517b9c948127319a09a7a36deac8" as Hex32;
const MERKLE_ROOT = "0x68203f90e9d07dc5859259d7536e87a6ba9d345f2552b5b9de2999ddce9ce1bf" as Hex32;

describe("anchor_hash", () => {
  it("derives and anchors a direct keccak256 hash", async () => {
    const client = new FakeRegistry({ head: 100n });
    const tools = createTools(client, testConfig({ confirmations: 1 }));

    const result = await runTool(tools.anchor_hash, {
      payload: "hello",
      codecId: "raw",
      algo: 1,
    });

    expect(result.hash).toBe(HELLO_HASH);
    expect(result.isMerkleRoot).toBe(false);
    expect(result.algo).toBe(1);
    expect(result.codecId).toBe("raw");
    expect(result.anchorer).toBe(FAKE_ANCHORER);
    expect(result.chainId).toBe(80002);
    expect(result.txHash).toMatch(/^0x[0-9a-f]{64}$/);
    expect(result.salt).toBeUndefined();

    // The write is observable through the read path.
    const found = await runTool(tools.get_anchor, { hash: HELLO_HASH });
    expect(found.verified).toBe(true);
  });

  it("builds and anchors a Merkle root from leaves (algo 0x20)", async () => {
    const client = new FakeRegistry({ head: 100n });
    const tools = createTools(client, testConfig({ confirmations: 1 }));

    const result = await runTool(tools.anchor_hash, {
      codecId: "raw",
      algo: 0x20,
      leaves: ["a", "b", "c", "d"],
      encoding: "utf8",
    });

    expect(result.hash).toBe(MERKLE_ROOT);
    expect(result.isMerkleRoot).toBe(true);
  });

  it("echoes a generated salt for salted algos", async () => {
    const client = new FakeRegistry({ head: 100n });
    const tools = createTools(client, testConfig({ confirmations: 1 }));

    const salt = `0x${"00".repeat(32)}`;
    const result = await runTool(tools.anchor_hash, {
      payload: "hello",
      codecId: "raw",
      algo: 17,
      salt,
    });

    expect(result.salt).toBe(salt);
    expect(result.hash).toMatch(/^0x[0-9a-f]{64}$/);
  });

  it("fails to re-anchor an already-anchored hash (first-seen wins)", async () => {
    const client = new FakeRegistry({ head: 100n });
    const tools = createTools(client, testConfig({ confirmations: 1 }));

    await runTool(tools.anchor_hash, { payload: "hello", codecId: "raw", algo: 1 });
    await expect(
      runTool(tools.anchor_hash, { payload: "hello", codecId: "raw", algo: 1 }),
    ).rejects.toThrow(/AlreadyAnchored/);
  });

  it("requires leaves for the Merkle algo", async () => {
    const client = new FakeRegistry();
    const tools = createTools(client, testConfig());

    await expect(
      runTool(tools.anchor_hash, { codecId: "raw", algo: 0x20, payload: "x" }),
    ).rejects.toThrow(/non-empty leaves/);
  });
});

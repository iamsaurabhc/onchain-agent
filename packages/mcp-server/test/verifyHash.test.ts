import { describe, expect, it } from "vitest";
import type { Hex32 } from "@onchain-agent/hash-core";
import { createTools } from "../src/tools/index.js";
import { FAKE_ANCHORER, FakeRegistry } from "./helpers/fakeRegistry.js";
import { runTool, testConfig } from "./helpers/run.js";

// keccak256(utf8("hello")), codec raw / algo 0x01.
const HELLO_HASH = "0x1c8aff950685c2ed4bc3174f3472287b56d9517b9c948127319a09a7a36deac8" as Hex32;
const HELLO_ARGS = { payload: "hello", codecId: "raw", algo: 1, encoding: "utf8" };

describe("verify_hash", () => {
  it("verifies an anchored payload (re-derives the hash, by_payload)", async () => {
    const client = new FakeRegistry({ head: 100n });
    client.seed({ hash: HELLO_HASH, algo: 1, blockNumber: 100, blockTimestamp: 1750000000 });
    const tools = createTools(client, testConfig({ confirmations: 1 }));

    const result = await runTool(tools.verify_hash, HELLO_ARGS);

    expect(result).toEqual({
      verified: true,
      method: "by_payload",
      hash: HELLO_HASH,
      anchorer: FAKE_ANCHORER,
      blockNumber: 100,
      blockTimestamp: 1750000000,
      confirmations: 1,
      chainId: 80002,
      reason: null,
    });
  });

  it("returns NOT_FOUND when the derived hash was never anchored", async () => {
    const client = new FakeRegistry();
    const tools = createTools(client, testConfig());

    const result = await runTool(tools.verify_hash, HELLO_ARGS);

    expect(result.verified).toBe(false);
    expect(result.reason).toBe("NOT_FOUND");
    expect(result.hash).toBe(HELLO_HASH);
  });

  it("rejects a payload whose claimed hash differs (HASH_MISMATCH, no chain read)", async () => {
    const client = new FakeRegistry();
    client.throwOnRead = true; // prove the mismatch is caught before any RPC call
    const tools = createTools(client, testConfig());

    const result = await runTool(tools.verify_hash, {
      ...HELLO_ARGS,
      claimedHash: `0x${"1".repeat(64)}`,
    });

    expect(result.verified).toBe(false);
    expect(result.reason).toBe("HASH_MISMATCH");
    expect(result.hash).toBe(HELLO_HASH);
  });

  it("returns INSUFFICIENT_CONFIRMATIONS when not yet final", async () => {
    const client = new FakeRegistry({ head: 100n });
    client.seed({ hash: HELLO_HASH, algo: 1, blockNumber: 100, blockTimestamp: 1750000000 });
    const tools = createTools(client, testConfig({ confirmations: 64 }));

    const result = await runTool(tools.verify_hash, HELLO_ARGS);

    expect(result.verified).toBe(false);
    expect(result.reason).toBe("INSUFFICIENT_CONFIRMATIONS");
    expect(result.confirmations).toBe(1);
  });

  it("surfaces transport failures as RPC_ERROR (inconclusive, not 'not anchored')", async () => {
    const client = new FakeRegistry();
    client.throwOnRead = true;
    const tools = createTools(client, testConfig());

    const result = await runTool(tools.verify_hash, HELLO_ARGS);

    expect(result.verified).toBe(false);
    expect(result.reason).toBe("RPC_ERROR");
  });

  it("requires an explicit salt for salted algos", async () => {
    const client = new FakeRegistry();
    const tools = createTools(client, testConfig());

    await expect(
      runTool(tools.verify_hash, { ...HELLO_ARGS, algo: 17 }),
    ).rejects.toThrow(/salt is required/);
  });
});

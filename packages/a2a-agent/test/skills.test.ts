import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import type { Hex32 } from "@onchain-agent/hash-core";
import { FakeRegistry, FAKE_ANCHORER } from "@onchain-agent/anchor-client/test/fakeRegistry";
import { fromCreateTools } from "../src/toolset.js";
import { anchorPayload, verifyAnchor } from "../src/skills/index.js";
import { testConfig } from "./helpers/run.js";

const fixturesDir = join(dirname(fileURLToPath(import.meta.url)), "fixtures");

function loadFixture<T>(name: string): T {
  return JSON.parse(readFileSync(join(fixturesDir, name), "utf8")) as T;
}

// keccak256(utf8("hello")), codec raw / algo 0x01.
const HELLO_HASH = "0x1c8aff950685c2ed4bc3174f3472287b56d9517b9c948127319a09a7a36deac8" as Hex32;

describe("anchor-payload skill core", () => {
  it("maps task → anchor_hash → schema-conformant output (fixture)", async () => {
    const fixture = loadFixture<{
      task: { input: Parameters<typeof anchorPayload>[1] };
      expected: { hash: string; chainId: number; algo: number };
    }>("anchor-payload-success.json");

    const client = new FakeRegistry({ head: 100n });
    const toolset = fromCreateTools(client, testConfig({ confirmations: 1 }));

    const result = await anchorPayload(toolset, fixture.task.input);

    expect(result.hash).toMatch(/^0x[0-9a-f]{64}$/);
    expect(result.chainId).toBe(fixture.expected.chainId);
    expect(result.algo).toBe(fixture.expected.algo);
    expect(result.txHash).toMatch(/^0x[0-9a-f]{64}$/);
    expect(result.anchorer).toBe(FAKE_ANCHORER);
  });
});

describe("verify-anchor skill core", () => {
  it("verifies anchored payload (by_payload fixture)", async () => {
    const fixture = loadFixture<{
      task: { input: Parameters<typeof verifyAnchor>[1] };
      expected: { verified: boolean; method: string; hash: string; reason: null };
    }>("verify-anchor-by-payload-success.json");

    const client = new FakeRegistry({ head: 100n });
    client.seed({ hash: HELLO_HASH, algo: 1, blockNumber: 100, blockTimestamp: 1750000000 });
    const toolset = fromCreateTools(client, testConfig({ confirmations: 1 }));

    const result = await verifyAnchor(toolset, fixture.task.input);

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

  it("returns NOT_FOUND for never-anchored payload", async () => {
    const fixture = loadFixture<{
      task: { input: Parameters<typeof verifyAnchor>[1] };
      expected: { verified: boolean; reason: string };
    }>("verify-anchor-not-found.json");

    const client = new FakeRegistry();
    const toolset = fromCreateTools(client, testConfig());

    const result = await verifyAnchor(toolset, fixture.task.input);

    expect(result.verified).toBe(fixture.expected.verified);
    expect(result.reason).toBe(fixture.expected.reason);
    expect(result.method).toBe("by_payload");
  });

  it("returns HASH_MISMATCH when claimed hash differs", async () => {
    const fixture = loadFixture<{
      task: { input: Parameters<typeof verifyAnchor>[1] };
      expected: { verified: boolean; reason: string };
    }>("verify-anchor-hash-mismatch.json");

    const client = new FakeRegistry();
    client.throwOnRead = true;
    const toolset = fromCreateTools(client, testConfig());

    const result = await verifyAnchor(toolset, fixture.task.input);

    expect(result.verified).toBe(fixture.expected.verified);
    expect(result.reason).toBe(fixture.expected.reason);
  });

  it("routes by_hash to get_anchor", async () => {
    const client = new FakeRegistry({ head: 100n });
    client.seed({ hash: HELLO_HASH, algo: 1, blockNumber: 100, blockTimestamp: 1750000000 });
    const toolset = fromCreateTools(client, testConfig({ confirmations: 1 }));

    const result = await verifyAnchor(toolset, {
      method: "by_hash",
      hash: HELLO_HASH,
    });

    expect(result.verified).toBe(true);
    expect(result.method).toBe("by_hash");
    expect(result.hash).toBe(HELLO_HASH);
  });

  it("routes by_log to verify_by_log", async () => {
    const client = new FakeRegistry({ head: 100n });
    client.seed({ hash: HELLO_HASH, algo: 1, blockNumber: 100, blockTimestamp: 1750000000 });
    const toolset = fromCreateTools(client, testConfig({ confirmations: 1 }));

    const result = await verifyAnchor(toolset, {
      method: "by_log",
      hash: HELLO_HASH,
    });

    expect(result.verified).toBe(true);
    expect(result.method).toBe("by_log_scan");
  });

  it("surfaces RPC_ERROR without collapsing to NOT_FOUND", async () => {
    const client = new FakeRegistry();
    client.throwOnRead = true;
    const toolset = fromCreateTools(client, testConfig());

    const result = await verifyAnchor(toolset, {
      method: "by_payload",
      payload: "hello",
      codecId: "raw",
      algo: 1,
      encoding: "utf8",
    });

    expect(result.verified).toBe(false);
    expect(result.reason).toBe("RPC_ERROR");
  });

  it("propagates MCP taxonomy for adversarial fixture", async () => {
    const fixture = loadFixture<{
      task: { input: Parameters<typeof verifyAnchor>[1] };
      expected: { verified: boolean; reason: string };
    }>("adversarial-claim-never-anchored.json");

    const client = new FakeRegistry();
    const toolset = fromCreateTools(client, testConfig());

    const result = await verifyAnchor(toolset, fixture.task.input);

    expect(result.verified).toBe(fixture.expected.verified);
    expect(result.reason).toBe(fixture.expected.reason);
  });
});

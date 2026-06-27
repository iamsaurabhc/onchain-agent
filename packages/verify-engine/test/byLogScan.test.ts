import { describe, expect, it } from "vitest";
import type { Hex32 } from "@onchain-agent/hash-core";
import type { Config } from "@onchain-agent/anchor-client";
import {
  FakeRegistry,
  FAKE_ANCHORER,
} from "@onchain-agent/anchor-client/test/fakeRegistry";
import { VerificationEngine } from "../src/engine.js";

const HELLO_HASH = "0x1c8aff950685c2ed4bc3174f3472287b56d9517b9c948127319a09a7a36deac8" as Hex32;

function testConfig(over?: Partial<Config>): Config {
  return {
    rpcUrl: "http://127.0.0.1:8545",
    chainId: 80002,
    registryAddress: "0x0000000000000000000000000000000000000abc",
    confirmations: 1,
    ...over,
  };
}

describe("verifyByLogScan", () => {
  it("verifies from logs even when storage is empty", async () => {
    const client = new FakeRegistry({ head: 100n });
    client.seedAnchoredLogs(HELLO_HASH, [
      {
        hash: HELLO_HASH,
        anchorer: FAKE_ANCHORER,
        algo: 1,
        isMerkleRoot: false,
        blockTimestamp: 1750000000n,
        blockNumber: 100n,
      },
    ]);
    const engine = new VerificationEngine(client, testConfig());

    const result = await engine.verifyByLogScan({ hash: HELLO_HASH });
    expect(result.verified).toBe(true);
    expect(result.method).toBe("by_log_scan");
  });

  it("returns NOT_FOUND when no logs exist", async () => {
    const client = new FakeRegistry({ head: 100n });
    client.seedAnchoredLogs(HELLO_HASH, []);
    const engine = new VerificationEngine(client, testConfig());

    const result = await engine.verifyByLogScan({ hash: HELLO_HASH });
    expect(result.verified).toBe(false);
    expect(result.reason).toBe("NOT_FOUND");
  });
});

describe("chainId guard", () => {
  it("rejects client/config chainId mismatch", () => {
    const client = new FakeRegistry({ chainId: 31337 });
    expect(() => new VerificationEngine(client, testConfig({ chainId: 80002 }))).toThrow(
      /chainId mismatch/,
    );
  });
});

describe("verifyByHash crossCheckLogs", () => {
  it("returns REORG when storage has record but logs are empty", async () => {
    const client = new FakeRegistry({ head: 100n });
    client.seed({
      hash: HELLO_HASH,
      algo: 1,
      blockNumber: 100,
      blockTimestamp: 1750000000,
    });
    client.seedAnchoredLogs(HELLO_HASH, []);
    const engine = new VerificationEngine(client, testConfig());

    const result = await engine.verifyByHash({ hash: HELLO_HASH, crossCheckLogs: true });
    expect(result.verified).toBe(false);
    expect(result.reason).toBe("REORG");
  });
});

describe("verifyByTx REORG", () => {
  it("returns REORG when receipt is missing but expectedHash was supplied", async () => {
    const client = new FakeRegistry({ head: 100n });
    const txHash = `0x${"aa".repeat(32)}` as Hex32;
    client.seedReceipt(txHash, null);
    const engine = new VerificationEngine(client, testConfig());

    const result = await engine.verifyByTx({ txHash, expectedHash: HELLO_HASH });
    expect(result.verified).toBe(false);
    expect(result.reason).toBe("REORG");
  });
});

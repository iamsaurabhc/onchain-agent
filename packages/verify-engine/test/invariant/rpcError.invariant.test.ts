import { describe, expect, it } from "vitest";
import type { Hex32 } from "@onchain-agent/hash-core";
import type { Config } from "@onchain-agent/anchor-client";
import { FakeRegistry } from "@onchain-agent/anchor-client/test/fakeRegistry";
import { VerificationEngine } from "../../src/engine.js";

const HELLO_HASH = "0x1c8aff950685c2ed4bc3174f3472287b56d9517b9c948127319a09a7a36deac8" as Hex32;
const MERKLE_ROOT = "0x4938a282fd3c4c406cbea286db9ccca40b06016ed75e0a1d51685bf82bb29814" as Hex32;
const MERKLE_LEAF = "0x74d513524a9792ef4f3b419f91b816156c20144ecda35d89f3f29d7c8902c779" as Hex32;
const MERKLE_PROOF = [
  "0xae90eb3e424b72f100bd5d1861c00e08abb0202bbd912ef53571f4e2a937ff9f",
  "0x7bf07e5e3db8ae1446cc8e63ffc8b5f4c6c310ea266c6c6fe8823aee02e3ed35",
  "0x88df163fb1db5853cbfeb734109e9af12e970d5e35ff20c6e4f42697691b941c",
] as Hex32[];

function testConfig(): Config {
  return {
    rpcUrl: "http://127.0.0.1:8545",
    chainId: 80002,
    registryAddress: "0x0000000000000000000000000000000000000abc",
    confirmations: 1,
  };
}

describe("RPC_ERROR invariant", () => {
  const methods = [
    {
      name: "verifyByHash",
      run: (engine: VerificationEngine) => engine.verifyByHash({ hash: HELLO_HASH }),
    },
    {
      name: "verifyByPayload",
      run: (engine: VerificationEngine) =>
        engine.verifyByPayload({
          payload: "hello",
          codecId: "raw",
          algo: 1,
          encoding: "utf8",
        }),
    },
    {
      name: "verifyByTx",
      run: (engine: VerificationEngine) =>
        engine.verifyByTx({ txHash: `0x${"bb".repeat(32)}` as Hex32 }),
    },
    {
      name: "verifyByMerkle",
      run: (engine: VerificationEngine) =>
        engine.verifyByMerkle({
          root: MERKLE_ROOT,
          leaf: MERKLE_LEAF,
          proof: MERKLE_PROOF,
          encoding: "utf8",
        }),
    },
    {
      name: "verifyByLogScan",
      run: (engine: VerificationEngine) => engine.verifyByLogScan({ hash: HELLO_HASH }),
    },
  ] as const;

  for (const { name, run } of methods) {
    it(`${name} surfaces RPC_ERROR, never NOT_FOUND, on transport failure`, async () => {
      const client = new FakeRegistry({ head: 100n });
      client.seed({
        hash: HELLO_HASH,
        algo: 1,
        blockNumber: 100,
        blockTimestamp: 1750000000,
      });
      client.seed({
        hash: MERKLE_ROOT,
        algo: 32,
        isMerkleRoot: true,
        blockNumber: 100,
        blockTimestamp: 1750000000,
      });
      client.throwOnRead = true;
      const engine = new VerificationEngine(client, testConfig());

      const result = await run(engine);
      expect(result.verified).toBe(false);
      expect(result.reason).toBe("RPC_ERROR");
      expect(result.reason).not.toBe("NOT_FOUND");
    });
  }
});

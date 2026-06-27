import { describe, expect, it } from "vitest";
import * as fc from "fast-check";
import type { Hex32 } from "@onchain-agent/hash-core";
import type { Config } from "@onchain-agent/anchor-client";
import { FakeRegistry } from "@onchain-agent/anchor-client/test/fakeRegistry";
import { VerificationEngine } from "../../src/engine.js";

const HELLO_HASH = "0x1c8aff950685c2ed4bc3174f3472287b56d9517b9c948127319a09a7a36deac8" as Hex32;

function testConfig(confirmations: number): Config {
  return {
    rpcUrl: "http://127.0.0.1:8545",
    chainId: 80002,
    registryAddress: "0x0000000000000000000000000000000000000abc",
    confirmations,
  };
}

describe("confirmations boundary fuzz", () => {
  it("required-1 => INSUFFICIENT_CONFIRMATIONS, required => verified:true", () => {
    fc.assert(
      fc.asyncProperty(
        fc.integer({ min: 1, max: 1000 }),
        fc.integer({ min: 0, max: 5000 }),
        async (required, blockOffset) => {
          const blockNumber = 100;
          const head = BigInt(blockNumber + blockOffset);
          const client = new FakeRegistry({ head });
          client.seed({
            hash: HELLO_HASH,
            algo: 1,
            blockNumber,
            blockTimestamp: 1750000000,
          });
          const engine = new VerificationEngine(client, testConfig(required));
          const result = await engine.verifyByHash({ hash: HELLO_HASH });

          const confirmations = Number(head - BigInt(blockNumber) + 1n);
          if (confirmations >= required) {
            expect(result.verified).toBe(true);
            expect(result.reason).toBeNull();
          } else {
            expect(result.verified).toBe(false);
            expect(result.reason).toBe("INSUFFICIENT_CONFIRMATIONS");
            expect(result.confirmations).toBe(confirmations);
          }
        },
      ),
      { numRuns: 50 },
    );
  });
});

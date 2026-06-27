import { Buffer } from "node:buffer";
import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { createTools } from "../src/tools/index.js";
import { FakeRegistry } from "./helpers/fakeRegistry.js";
import { runTool, testConfig } from "./helpers/run.js";

function toolsForFreshRegistry() {
  const client = new FakeRegistry({ head: 100n });
  return createTools(client, testConfig({ confirmations: 1 }));
}

describe("fuzz: anchor -> verify round-trip", () => {
  it("a freshly anchored payload always verifies to verified:true", async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.string({ minLength: 1 }),
        fc.constantFrom(1, 2), // keccak256 / sha256 direct algos
        async (payload, algo) => {
          const tools = toolsForFreshRegistry();
          const anchored = await runTool(tools.anchor_hash, {
            payload,
            codecId: "raw",
            algo,
            encoding: "utf8",
          });
          const verified = await runTool(tools.verify_hash, {
            payload,
            codecId: "raw",
            algo,
            encoding: "utf8",
            claimedHash: anchored.hash,
          });
          return verified.verified === true && verified.hash === anchored.hash;
        },
      ),
      { numRuns: 100 },
    );
  });
});

describe("invariant: a one-byte mutation never verifies", () => {
  it("mutating any single byte of the payload yields NOT_FOUND against the original anchor", async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.uint8Array({ minLength: 1, maxLength: 64 }),
        fc.nat(),
        async (bytes, idxSeed) => {
          const tools = toolsForFreshRegistry();
          const original = `0x${Buffer.from(bytes).toString("hex")}`;
          await runTool(tools.anchor_hash, {
            payload: original,
            codecId: "raw",
            algo: 1,
            encoding: "hex",
          });

          // Flip one byte; this is guaranteed to change the canonical bytes.
          const i = idxSeed % bytes.length;
          const mutated = Uint8Array.from(bytes);
          mutated[i] = (mutated[i] ^ 0xff) & 0xff;
          const mutatedHex = `0x${Buffer.from(mutated).toString("hex")}`;

          const res = await runTool(tools.verify_hash, {
            payload: mutatedHex,
            codecId: "raw",
            algo: 1,
            encoding: "hex",
          });
          return res.verified === false && res.reason === "NOT_FOUND";
        },
      ),
      { numRuns: 100 },
    );
  });
});

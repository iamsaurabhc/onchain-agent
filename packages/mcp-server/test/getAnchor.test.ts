import { describe, expect, it } from "vitest";
import type { Hex32 } from "@onchain-agent/hash-core";
import { createTools } from "../src/tools/index.js";
import { FAKE_ANCHORER, FakeRegistry } from "@onchain-agent/anchor-client/test/fakeRegistry";
import { runTool, testConfig } from "./helpers/run.js";

const HASH = "0xc41589e7559804ea4a2080dad19d876a024ccb05117835447d72ce08c1d020ec" as Hex32;
const META = `0x${"ab".repeat(32)}` as Hex32;

describe("get_anchor", () => {
  it("returns the record for an anchored hash (by_hash)", async () => {
    const client = new FakeRegistry({ head: 100n });
    client.seed({
      hash: HASH,
      algo: 2,
      isMerkleRoot: false,
      blockNumber: 100,
      blockTimestamp: 1750000000,
      metadataHash: META,
    });
    const tools = createTools(client, testConfig({ confirmations: 1 }));

    const result = await runTool(tools.get_anchor, { hash: HASH });

    expect(result).toEqual({
      verified: true,
      method: "by_hash",
      hash: HASH,
      anchorer: FAKE_ANCHORER,
      blockNumber: 100,
      blockTimestamp: 1750000000,
      confirmations: 1,
      chainId: 80002,
      reason: null,
      algo: 2,
      isMerkleRoot: false,
      metadataHash: META,
    });
  });

  it("returns NOT_FOUND for a never-anchored hash", async () => {
    const client = new FakeRegistry();
    const tools = createTools(client, testConfig());

    const result = await runTool(tools.get_anchor, { hash: HASH });

    expect(result.verified).toBe(false);
    expect(result.reason).toBe("NOT_FOUND");
    expect(result.algo).toBeNull();
    expect(result.metadataHash).toBeNull();
  });

  it("returns RPC_ERROR on transport failure", async () => {
    const client = new FakeRegistry();
    client.throwOnRead = true;
    const tools = createTools(client, testConfig());

    const result = await runTool(tools.get_anchor, { hash: HASH });

    expect(result.verified).toBe(false);
    expect(result.reason).toBe("RPC_ERROR");
  });
});

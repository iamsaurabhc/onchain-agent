import { describe, expect, it } from "vitest";
import type { Hex32 } from "@onchain-agent/hash-core";
import { createTools } from "../src/tools/index.js";
import { FAKE_ANCHORER, FakeRegistry } from "@onchain-agent/anchor-client/test/fakeRegistry";
import { runTool, testConfig } from "./helpers/run.js";

const TX = `0x${"11".repeat(32)}` as Hex32;
const HASH = "0xc41589e7559804ea4a2080dad19d876a024ccb05117835447d72ce08c1d020ec" as Hex32;

function withTxLog(): FakeRegistry {
  const client = new FakeRegistry({ head: 100n });
  client.seedTxLogs(TX, [
    {
      hash: HASH,
      anchorer: FAKE_ANCHORER,
      algo: 1,
      isMerkleRoot: false,
      blockTimestamp: 1750000000n,
      blockNumber: 100n,
    },
  ]);
  return client;
}

describe("verify_by_tx", () => {
  it("decodes the anchoring event from a tx receipt (by_tx)", async () => {
    const tools = createTools(withTxLog(), testConfig({ confirmations: 1 }));

    const result = await runTool(tools.verify_by_tx, { txHash: TX });

    expect(result).toEqual({
      verified: true,
      method: "by_tx",
      hash: HASH,
      anchorer: FAKE_ANCHORER,
      blockNumber: 100,
      blockTimestamp: 1750000000,
      confirmations: 1,
      chainId: 80002,
      reason: null,
    });
  });

  it("matches an expectedHash against the decoded events", async () => {
    const tools = createTools(withTxLog(), testConfig({ confirmations: 1 }));

    const result = await runTool(tools.verify_by_tx, { txHash: TX, expectedHash: HASH });

    expect(result.verified).toBe(true);
  });

  it("returns HASH_MISMATCH when expectedHash is not in the tx", async () => {
    const tools = createTools(withTxLog(), testConfig());

    const result = await runTool(tools.verify_by_tx, {
      txHash: TX,
      expectedHash: `0x${"2".repeat(64)}`,
    });

    expect(result.verified).toBe(false);
    expect(result.reason).toBe("HASH_MISMATCH");
  });

  it("returns NOT_FOUND when the tx emitted no anchoring event", async () => {
    const client = new FakeRegistry();
    const tools = createTools(client, testConfig());

    const result = await runTool(tools.verify_by_tx, { txHash: TX });

    expect(result.verified).toBe(false);
    expect(result.reason).toBe("NOT_FOUND");
  });

  it("returns RPC_ERROR on transport failure", async () => {
    const client = withTxLog();
    client.throwOnRead = true;
    const tools = createTools(client, testConfig());

    const result = await runTool(tools.verify_by_tx, { txHash: TX });

    expect(result.verified).toBe(false);
    expect(result.reason).toBe("RPC_ERROR");
  });
});

import { describe, expect, it } from "vitest";
import { FakeRegistry } from "@onchain-agent/anchor-client/test/fakeRegistry";
import { fromCreateTools } from "../src/toolset.js";
import { anchorPayload, verifyAnchor } from "../src/skills/index.js";
import { testConfig } from "./helpers/run.js";

describe("adversarial invariant: mutated payload never verifies", () => {
  it("one-byte mutation yields verified:false (HASH_MISMATCH or NOT_FOUND)", async () => {
    const client = new FakeRegistry({ head: 100n });
    const toolset = fromCreateTools(client, testConfig({ confirmations: 1 }));

    const original = "phase-f-adversarial-payload";
    const anchored = await anchorPayload(toolset, {
      payload: original,
      codecId: "raw",
      algo: 1,
      encoding: "utf8",
    });

    expect(anchored.hash).toMatch(/^0x[0-9a-f]{64}$/);

    const mutated = original.slice(0, -1) + (original.endsWith("a") ? "b" : "a");
    const forged = await verifyAnchor(toolset, {
      method: "by_payload",
      payload: mutated,
      codecId: "raw",
      algo: 1,
      encoding: "utf8",
      claimedHash: anchored.hash,
    });

    expect(forged.verified).toBe(false);
    expect(["HASH_MISMATCH", "NOT_FOUND"]).toContain(forged.reason);
  });

  it("orchestrator claim without anchor → NOT_FOUND", async () => {
    const client = new FakeRegistry();
    const toolset = fromCreateTools(client, testConfig());

    const result = await verifyAnchor(toolset, {
      method: "by_payload",
      payload: `ghost-${Date.now()}`,
      codecId: "raw",
      algo: 1,
      encoding: "utf8",
    });

    expect(result.verified).toBe(false);
    expect(result.reason).toBe("NOT_FOUND");
  });
});

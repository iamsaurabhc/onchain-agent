import { beforeAll, describe, expect, it } from "vitest";
import { merkle, utf8, hashPayload, CodecId, AlgoTag, type Hex32 } from "@onchain-agent/hash-core";
import {
  DEFAULT_CHAIN_ID,
  loadConfig,
  loadLocalEnv,
  ViemRegistryClient,
  computeConfirmations,
} from "@onchain-agent/anchor-client";
import { VerificationEngine } from "../../src/engine.js";

const AMOY_E2E = process.env.AMOY_E2E === "1";
const ZERO_HASH = `0x${"0".repeat(64)}` as Hex32;

loadLocalEnv(new URL("../../src/index.ts", import.meta.url).href);

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function waitForFinality(
  client: ViemRegistryClient,
  blockNumber: bigint,
  required: number,
): Promise<number> {
  for (let i = 0; i < 120; i++) {
    const head = await client.getHeadBlockNumber();
    const confirmations = computeConfirmations(head, blockNumber);
    if (confirmations >= required) return confirmations;
    await sleep(5_000);
  }
  throw new Error(`timed out waiting for ${required} confirmations`);
}

describe.skipIf(!AMOY_E2E)("e2e: live Amoy anchor-then-verify", () => {
  let client: ViemRegistryClient;
  let engine: VerificationEngine;
  let config: ReturnType<typeof loadConfig>;

  beforeAll(() => {
    config = loadConfig();
    if (!config.anchorerPrivateKey) {
      throw new Error("AMOY_E2E requires ANCHORER_PRIVATE_KEY in .env.local");
    }
    client = new ViemRegistryClient(config);
    engine = new VerificationEngine(client, config);
  });

  it("asserts chainId is Amoy (80002) unless explicitly overridden", () => {
    expect(client.chainId).toBe(config.chainId);
    if (process.env.CHAIN_ID === undefined) {
      expect(config.chainId).toBe(DEFAULT_CHAIN_ID);
    }
  });

  it("anchor → poll confirmations → verify by hash/payload/tx/log", async () => {
    const payload = `amoy-e2e-${Date.now()}`;
    // Derive from UTF-8 bytes exactly as the production by-payload path does
    // (toPayloadArg → utf8). The raw normalizer expects bytes, not a string.
    const { hash } = hashPayload(utf8(payload), {
      codecId: CodecId.RAW,
      algo: AlgoTag.KECCAK256,
    });

    const write = await client.anchor(hash, 1, ZERO_HASH);

    const required = Math.min(config.confirmations, 5);
    const smokeEngine = new VerificationEngine(client, { ...config, confirmations: required });

    const confirmations = await waitForFinality(client, write.blockNumber, required);
    expect(confirmations).toBeGreaterThanOrEqual(required);

    const hashResult = await smokeEngine.verifyByHash({ hash });
    expect(hashResult.verified).toBe(true);
    expect(hashResult.confirmations).toBeGreaterThanOrEqual(required);

    const payloadResult = await smokeEngine.verifyByPayload({
      payload,
      codecId: "raw",
      algo: 1,
      encoding: "utf8",
    });
    expect(payloadResult.verified).toBe(true);

    const txResult = await smokeEngine.verifyByTx({
      txHash: write.txHash,
      expectedHash: hash,
    });
    expect(txResult.verified).toBe(true);

    const logResult = await smokeEngine.verifyByLogScan({ hash });
    expect(logResult.verified).toBe(true);
    expect(logResult.method).toBe("by_log_scan");
  }, 600_000);

  it("never-anchored hash → NOT_FOUND", async () => {
    const ghost = merkle.leafHash(utf8(`never-${Date.now()}`)) as Hex32;
    const result = await engine.verifyByHash({ hash: ghost });
    expect(result.verified).toBe(false);
    expect(result.reason).toBe("NOT_FOUND");
  });

  it("merkle batch anchor → verify_merkle member", async () => {
    // Unique leaves per run so the root differs each time; the registry is
    // first-seen-wins, so a static root would revert (AlreadyAnchored) on re-run.
    const nonce = Date.now();
    const leaves = [`amoy-leaf-a-${nonce}`, `amoy-leaf-b-${nonce}`, `amoy-leaf-c-${nonce}`].map(
      (s) => utf8(s),
    );
    const leafHashes = leaves.map((b) => merkle.leafHash(b));
    const root = merkle.buildRoot(leafHashes);

    await client.anchorMerkleRoot(root, 0x20, ZERO_HASH);
    const proof = merkle.getProof(leafHashes, leafHashes[0]);

    const required = Math.min(config.confirmations, 5);
    const smokeEngine = new VerificationEngine(client, { ...config, confirmations: required });
    const head = await client.getHeadBlockNumber();
    await waitForFinality(client, head, required);

    const result = await smokeEngine.verifyByMerkle({
      root,
      leaf: leafHashes[0],
      proof,
      encoding: "utf8",
    });
    expect(result.verified).toBe(true);
    expect(result.method).toBe("by_merkle");
  }, 600_000);
});

describe("e2e: Amoy skipped without AMOY_E2E=1", () => {
  it("documents the env gate", () => {
    if (!AMOY_E2E) {
      expect(AMOY_E2E).toBe(false);
    }
  });
});

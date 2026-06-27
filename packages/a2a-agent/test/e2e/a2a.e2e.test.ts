import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createAnvil, type Anvil } from "@viem/anvil";
import {
  createPublicClient,
  createWalletClient,
  http,
  type Abi,
  type Address,
  type Hex,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { foundry } from "viem/chains";
import { loadAnchorRegistryArtifact, ViemRegistryClient } from "@onchain-agent/anchor-client";
import type { Config } from "@onchain-agent/anchor-client";
import { fromCreateTools } from "../../src/toolset.js";
import { anchorPayload, verifyAnchor } from "../../src/skills/index.js";

const DEV_PK = "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80" as Hex;
const ANVIL_CHAIN_ID = 31337;

describe("e2e: Phase F skills → MCP tools → AnchorRegistry on anvil", () => {
  let anvil: Anvil;
  let toolset: ReturnType<typeof fromCreateTools>;
  let devAddress: Address;

  beforeAll(async () => {
    const { abi, bytecode } = loadAnchorRegistryArtifact();
    const account = privateKeyToAccount(DEV_PK);
    devAddress = account.address;

    anvil = createAnvil({ port: 8611 });
    await anvil.start();
    const rpcUrl = `http://${anvil.host}:${anvil.port}`;

    const publicClient = createPublicClient({ chain: foundry, transport: http(rpcUrl) });
    const walletClient = createWalletClient({ account, chain: foundry, transport: http(rpcUrl) });

    const deployHash = await walletClient.deployContract({
      abi: abi as Abi,
      bytecode,
      account,
    });
    const receipt = await publicClient.waitForTransactionReceipt({ hash: deployHash });
    if (!receipt.contractAddress) throw new Error("deploy failed: no contractAddress");

    const config: Config = {
      rpcUrl,
      chainId: ANVIL_CHAIN_ID,
      registryAddress: receipt.contractAddress,
      anchorerPrivateKey: DEV_PK,
      confirmations: 1,
    };
    const client = new ViemRegistryClient(config);
    toolset = fromCreateTools(client, config);
  });

  afterAll(async () => {
    await anvil?.stop();
  });

  it("anchor-payload → verify-anchor round-trip (by_payload)", async () => {
    const payload = `a2a-e2e-${Date.now()}`;
    const anchored = await anchorPayload(toolset, {
      payload,
      codecId: "raw",
      algo: 1,
      encoding: "utf8",
    });

    expect(anchored.hash).toMatch(/^0x[0-9a-f]{64}$/);
    expect(anchored.chainId).toBe(ANVIL_CHAIN_ID);
    expect(anchored.anchorer.toLowerCase()).toBe(devAddress.toLowerCase());

    const verified = await verifyAnchor(toolset, {
      method: "by_payload",
      payload,
      codecId: "raw",
      algo: 1,
      encoding: "utf8",
      claimedHash: anchored.hash,
    });

    expect(verified.verified).toBe(true);
    expect(verified.method).toBe("by_payload");
    expect(verified.hash).toBe(anchored.hash);
  });

  it("verify-anchor by_tx and by_log after anchor", async () => {
    const payload = `a2a-e2e-tx-${Date.now()}`;
    const anchored = await anchorPayload(toolset, {
      payload,
      codecId: "raw",
      algo: 1,
      encoding: "utf8",
    });

    const byTx = await verifyAnchor(toolset, {
      method: "by_tx",
      txHash: anchored.txHash,
      expectedHash: anchored.hash,
    });
    expect(byTx.verified).toBe(true);
    expect(byTx.method).toBe("by_tx");

    const byLog = await verifyAnchor(toolset, {
      method: "by_log",
      hash: anchored.hash,
    });
    expect(byLog.verified).toBe(true);
    expect(byLog.method).toBe("by_log_scan");
  });

  it("never-anchored payload → NOT_FOUND", async () => {
    const result = await verifyAnchor(toolset, {
      method: "by_payload",
      payload: "never anchored anywhere in e2e",
      codecId: "raw",
      algo: 1,
      encoding: "utf8",
    });
    expect(result.verified).toBe(false);
    expect(result.reason).toBe("NOT_FOUND");
  });
});

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
import { merkle, utf8, type Hex32 } from "@onchain-agent/hash-core";
import { loadAnchorRegistryArtifact, ViemRegistryClient } from "@onchain-agent/anchor-client";
import type { Config } from "@onchain-agent/anchor-client";
import { createTools, type AnchorTools } from "../../src/tools/index.js";
import { runTool } from "../helpers/run.js";

const DEV_PK = "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80" as Hex;
const ANVIL_CHAIN_ID = 31337;

describe("e2e: Phase D/E tools against a deployed AnchorRegistry on anvil", () => {
  let anvil: Anvil;
  let tools: AnchorTools;
  let devAddress: Address;

  beforeAll(async () => {
    const { abi, bytecode } = loadAnchorRegistryArtifact();
    const account = privateKeyToAccount(DEV_PK);
    devAddress = account.address;

    anvil = createAnvil({ port: 8610 });
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
    tools = createTools(client, config);
  });

  afterAll(async () => {
    await anvil?.stop();
  });

  it("anchor_hash -> verify_hash -> get_anchor -> verify_by_tx -> verify_by_log round-trip (direct)", async () => {
    const args = { payload: "phase-d e2e payload", codecId: "raw", algo: 1, encoding: "utf8" };

    const anchored = await runTool(tools.anchor_hash, args);
    expect(anchored.hash).toMatch(/^0x[0-9a-f]{64}$/);
    expect(anchored.chainId).toBe(ANVIL_CHAIN_ID);
    expect(anchored.anchorer.toLowerCase()).toBe(devAddress.toLowerCase());

    const verified = await runTool(tools.verify_hash, {
      ...args,
      claimedHash: anchored.hash,
    });
    expect(verified.verified).toBe(true);
    expect(verified.method).toBe("by_payload");
    expect(verified.hash).toBe(anchored.hash);

    const record = await runTool(tools.get_anchor, { hash: anchored.hash });
    expect(record.verified).toBe(true);
    expect(record.algo).toBe(1);
    expect(record.isMerkleRoot).toBe(false);

    const byTx = await runTool(tools.verify_by_tx, {
      txHash: anchored.txHash,
      expectedHash: anchored.hash,
    });
    expect(byTx.verified).toBe(true);
    expect(byTx.method).toBe("by_tx");
    expect(byTx.hash).toBe(anchored.hash);

    const byLog = await runTool(tools.verify_by_log, { hash: anchored.hash });
    expect(byLog.verified).toBe(true);
    expect(byLog.method).toBe("by_log_scan");
    expect(byLog.hash).toBe(anchored.hash);
  });

  it("anchor_hash (merkle) -> verify_merkle_proof for a member, and rejects a non-member", async () => {
    const leafStrings = ["alpha", "beta", "gamma", "delta"];
    const leafHashes = leafStrings.map((s) => merkle.leafHash(utf8(s)));

    const anchored = await runTool(tools.anchor_hash, {
      codecId: "raw",
      algo: 0x20,
      leaves: leafStrings,
      encoding: "utf8",
    });
    expect(anchored.isMerkleRoot).toBe(true);
    const root = anchored.hash as Hex32;

    const member = leafHashes[0];
    const proof = merkle.getProof(leafHashes, member);
    const ok = await runTool(tools.verify_merkle_proof, { root, leaf: member, proof });
    expect(ok.verified).toBe(true);
    expect(ok.method).toBe("by_merkle");

    const nonMember = merkle.leafHash(utf8("not-in-the-tree"));
    const bad = await runTool(tools.verify_merkle_proof, { root, leaf: nonMember, proof });
    expect(bad.verified).toBe(false);
    expect(bad.reason).toBe("MERKLE_PROOF_INVALID");
  });

  it("verify_hash returns NOT_FOUND for a never-anchored payload", async () => {
    const res = await runTool(tools.verify_hash, {
      payload: "never anchored anywhere",
      codecId: "raw",
      algo: 1,
      encoding: "utf8",
    });
    expect(res.verified).toBe(false);
    expect(res.reason).toBe("NOT_FOUND");
  });

  it("get_anchor returns NOT_FOUND for a never-anchored hash", async () => {
    const neverAnchored = merkle.leafHash(utf8("never-anchored-hash")) as Hex32;
    const res = await runTool(tools.get_anchor, { hash: neverAnchored });
    expect(res.verified).toBe(false);
    expect(res.reason).toBe("NOT_FOUND");
  });
});

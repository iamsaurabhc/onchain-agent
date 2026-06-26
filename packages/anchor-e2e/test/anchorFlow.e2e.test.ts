import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createAnvil, type Anvil } from "@viem/anvil";
import {
  createPublicClient,
  createWalletClient,
  http,
  parseEventLogs,
  zeroHash,
  type Abi,
  type Address,
  type Hex,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { foundry } from "viem/chains";
import { merkle, utf8 } from "@onchain-agent/hash-core";
import type { Hex32 } from "@onchain-agent/hash-core";

const here = dirname(fileURLToPath(import.meta.url));
// packages/anchor-e2e/test -> repo root -> contracts/out/...
const ARTIFACT = join(
  here,
  "..",
  "..",
  "..",
  "contracts",
  "out",
  "AnchorRegistry.sol",
  "AnchorRegistry.json",
);

const ALGO_MERKLE = 0x20;
// Standard anvil dev account #0 (deterministic; safe for a local node only).
const DEV_PK = "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80" as Hex;

interface Artifact {
  abi: Abi;
  bytecode: { object: Hex };
}

describe("e2e: anchor a Merkle root on anvil and prove a leaf", () => {
  const account = privateKeyToAccount(DEV_PK);

  let anvil: Anvil;
  let abi: Abi;
  let bytecode: Hex;
  let registry: Address;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let publicClient: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let walletClient: any;

  beforeAll(async () => {
    const artifact: Artifact = JSON.parse(readFileSync(ARTIFACT, "utf8"));
    abi = artifact.abi;
    bytecode = artifact.bytecode.object;

    anvil = createAnvil({ port: 8600 });
    await anvil.start();
    const rpcUrl = `http://${anvil.host}:${anvil.port}`;

    publicClient = createPublicClient({ chain: foundry, transport: http(rpcUrl) });
    walletClient = createWalletClient({ account, chain: foundry, transport: http(rpcUrl) });

    const deployHash = await walletClient.deployContract({ abi, bytecode, account });
    const receipt = await publicClient.waitForTransactionReceipt({ hash: deployHash });
    if (!receipt.contractAddress) throw new Error("deploy failed: no contractAddress");
    registry = receipt.contractAddress;
  });

  afterAll(async () => {
    await anvil?.stop();
  });

  it("anchors an off-chain tree root and proves membership against the live node", async () => {
    // Build the tree off-chain with hash-core — the cross-language source of truth.
    const lines = [
      '{"ts":1,"action":"propose"}',
      '{"ts":2,"action":"allow"}',
      '{"ts":3,"action":"execute"}',
      '{"ts":4,"action":"anchor"}',
      '{"ts":5,"action":"verify"}',
    ];
    const leaves = lines.map((l) => merkle.leafHash(utf8(l)));
    const root = merkle.buildRoot(leaves);

    // Anchor the root on-chain and confirm the tx mined.
    const txHash = await walletClient.writeContract({
      address: registry,
      abi,
      functionName: "anchorMerkleRoot",
      args: [root, ALGO_MERKLE, zeroHash],
    });
    const receipt = await publicClient.waitForTransactionReceipt({ hash: txHash });
    expect(receipt.status).toBe("success");

    // The emitted event mirrors the anchored root.
    const events = parseEventLogs({ abi, logs: receipt.logs, eventName: "MerkleRootAnchored" });
    expect(events.length).toBe(1);
    expect((events[0].args as { root: Hex }).root.toLowerCase()).toBe(root.toLowerCase());

    // isAnchored(root) is true once mined.
    const anchored = await publicClient.readContract({
      address: registry,
      abi,
      functionName: "isAnchored",
      args: [root],
    });
    expect(anchored).toBe(true);

    // Every member proves against the live node via the registry's verifyMerkle.
    for (const leaf of leaves) {
      const proof = merkle.getProof(leaves, leaf);
      const ok = await publicClient.readContract({
        address: registry,
        abi,
        functionName: "verifyMerkle",
        args: [root, leaf, proof],
      });
      expect(ok).toBe(true);
    }

    // A non-member never verifies, even when handed a real member's proof.
    const nonMember = merkle.leafHash(utf8("not-in-the-tree"));
    const memberProof = merkle.getProof(leaves, leaves[0]);
    const bad = await publicClient.readContract({
      address: registry,
      abi,
      functionName: "verifyMerkle",
      args: [root, nonMember, memberProof],
    });
    expect(bad).toBe(false);

    // A never-anchored root reads as not anchored (the NOT_FOUND analog).
    const neverAnchored = merkle.leafHash(utf8("never-anchored-root")) as Hex32;
    const missing = await publicClient.readContract({
      address: registry,
      abi,
      functionName: "isAnchored",
      args: [neverAnchored],
    });
    expect(missing).toBe(false);
  });
});

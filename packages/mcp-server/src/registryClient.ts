import {
  createPublicClient,
  createWalletClient,
  defineChain,
  http,
  parseEventLogs,
  type Abi,
  type Account,
  type Address,
  type Hex,
  type PublicClient,
  type WalletClient,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import type { Hex32 } from "@onchain-agent/hash-core";
import { loadAnchorRegistryArtifact } from "./abi.js";
import type { Config } from "./config.js";

/** Mirror of the on-chain `AnchorRecord` struct (§4.1), decoded off-chain. */
export interface AnchorRecord {
  anchorer: Address;
  blockTimestamp: bigint;
  blockNumber: bigint;
  algo: number;
  isMerkleRoot: boolean;
  metadataHash: Hex;
}

/** A decoded `Anchored` / `MerkleRootAnchored` event from a tx receipt. */
export interface AnchoredLog {
  hash: Hex32;
  anchorer: Address;
  algo: number;
  isMerkleRoot: boolean;
  blockTimestamp: bigint;
  blockNumber: bigint;
}

/** Result of a write (anchor) transaction. */
export interface AnchorWriteResult {
  txHash: Hex32;
  blockNumber: bigint;
  blockTimestamp: bigint;
  anchorer: Address;
}

/**
 * Narrow chain-access surface used by the tools. Verification tools depend only
 * on this interface, so unit tests inject a mock and never touch a real RPC.
 */
export interface RegistryClient {
  readonly chainId: number;
  isAnchored(hash: Hex32): Promise<boolean>;
  getRecord(hash: Hex32): Promise<AnchorRecord>;
  verifyMerkle(root: Hex32, leaf: Hex32, proof: Hex32[]): Promise<boolean>;
  anchor(hash: Hex32, algo: number, metadataHash: Hex32): Promise<AnchorWriteResult>;
  anchorMerkleRoot(
    root: Hex32,
    algo: number,
    metadataHash: Hex32,
  ): Promise<AnchorWriteResult>;
  getHeadBlockNumber(): Promise<bigint>;
  /** Fetch a tx receipt and decode all anchoring events it emitted. */
  parseAnchoredLogs(txHash: Hex32): Promise<AnchoredLog[]>;
}

/** The zero address denotes "no record" in the registry mapping. */
export const ZERO_ADDRESS: Address = "0x0000000000000000000000000000000000000000";

/** viem-backed implementation against a deployed `AnchorRegistry`. */
export class ViemRegistryClient implements RegistryClient {
  readonly chainId: number;
  private readonly abi: Abi;
  private readonly address: Address;
  private readonly publicClient: PublicClient;
  private readonly walletClient?: WalletClient;
  private readonly account?: Account;

  constructor(config: Config) {
    this.chainId = config.chainId;
    this.address = config.registryAddress;
    this.abi = loadAnchorRegistryArtifact().abi;

    const chain = defineChain({
      id: config.chainId,
      name: `chain-${config.chainId}`,
      nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
      rpcUrls: { default: { http: [config.rpcUrl] } },
    });

    // cacheTime: 0 so getBlockNumber always reflects the latest head; a stale
    // cached head would understate confirmations for a just-mined anchor.
    this.publicClient = createPublicClient({
      chain,
      transport: http(config.rpcUrl),
      cacheTime: 0,
    });

    if (config.anchorerPrivateKey) {
      this.account = privateKeyToAccount(config.anchorerPrivateKey);
      this.walletClient = createWalletClient({
        account: this.account,
        chain,
        transport: http(config.rpcUrl),
      });
    }
  }

  async isAnchored(hash: Hex32): Promise<boolean> {
    return (await this.publicClient.readContract({
      address: this.address,
      abi: this.abi,
      functionName: "isAnchored",
      args: [hash],
    })) as boolean;
  }

  async getRecord(hash: Hex32): Promise<AnchorRecord> {
    const rec = (await this.publicClient.readContract({
      address: this.address,
      abi: this.abi,
      functionName: "getRecord",
      args: [hash],
    })) as {
      anchorer: Address;
      blockTimestamp: bigint;
      blockNumber: bigint;
      algo: number;
      isMerkleRoot: boolean;
      metadataHash: Hex;
    };
    return {
      anchorer: rec.anchorer,
      blockTimestamp: rec.blockTimestamp,
      blockNumber: rec.blockNumber,
      algo: rec.algo,
      isMerkleRoot: rec.isMerkleRoot,
      metadataHash: rec.metadataHash,
    };
  }

  async verifyMerkle(root: Hex32, leaf: Hex32, proof: Hex32[]): Promise<boolean> {
    return (await this.publicClient.readContract({
      address: this.address,
      abi: this.abi,
      functionName: "verifyMerkle",
      args: [root, leaf, proof],
    })) as boolean;
  }

  async anchor(hash: Hex32, algo: number, metadataHash: Hex32): Promise<AnchorWriteResult> {
    return this.write("anchor", [hash, algo, metadataHash]);
  }

  async anchorMerkleRoot(
    root: Hex32,
    algo: number,
    metadataHash: Hex32,
  ): Promise<AnchorWriteResult> {
    return this.write("anchorMerkleRoot", [root, algo, metadataHash]);
  }

  async getHeadBlockNumber(): Promise<bigint> {
    return this.publicClient.getBlockNumber();
  }

  async parseAnchoredLogs(txHash: Hex32): Promise<AnchoredLog[]> {
    const receipt = await this.publicClient.getTransactionReceipt({ hash: txHash });
    const block = await this.publicClient.getBlock({ blockNumber: receipt.blockNumber });
    const logs = parseEventLogs({
      abi: this.abi,
      logs: receipt.logs,
      eventName: ["Anchored", "MerkleRootAnchored"],
    });
    return logs.map((log) => {
      const args = log.args as {
        hash?: Hex32;
        root?: Hex32;
        anchorer: Address;
        algo: number;
        isMerkleRoot?: boolean;
      };
      const isMerkleRoot = log.eventName === "MerkleRootAnchored";
      return {
        hash: (args.hash ?? args.root) as Hex32,
        anchorer: args.anchorer,
        algo: args.algo,
        isMerkleRoot: args.isMerkleRoot ?? isMerkleRoot,
        blockTimestamp: block.timestamp,
        blockNumber: receipt.blockNumber,
      };
    });
  }

  private async write(
    functionName: "anchor" | "anchorMerkleRoot",
    args: [Hex32, number, Hex32],
  ): Promise<AnchorWriteResult> {
    if (!this.walletClient || !this.account) {
      throw new Error(
        "no signer configured: set ANCHORER_PRIVATE_KEY to enable the anchor write path",
      );
    }
    const txHash = (await this.walletClient.writeContract({
      address: this.address,
      abi: this.abi,
      functionName,
      args,
      account: this.account,
      chain: this.walletClient.chain,
    })) as Hex32;
    const receipt = await this.publicClient.waitForTransactionReceipt({ hash: txHash });
    if (receipt.status !== "success") {
      throw new Error(`anchor tx reverted: ${txHash}`);
    }
    const block = await this.publicClient.getBlock({ blockNumber: receipt.blockNumber });
    return {
      txHash,
      blockNumber: receipt.blockNumber,
      blockTimestamp: block.timestamp,
      anchorer: this.account.address,
    };
  }
}

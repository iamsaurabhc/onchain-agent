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
import { DEFAULT_LOG_SCAN_MAX_RANGE, DEFAULT_LOG_SCAN_LOOKBACK } from "./config.js";

/** Mirror of the on-chain `AnchorRecord` struct (§4.1), decoded off-chain. */
export interface AnchorRecord {
  anchorer: Address;
  blockTimestamp: bigint;
  blockNumber: bigint;
  algo: number;
  isMerkleRoot: boolean;
  metadataHash: Hex;
}

/** A decoded `Anchored` / `MerkleRootAnchored` event from a tx receipt or log scan. */
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

/** Minimal tx receipt for reorg detection. */
export interface TxReceiptSummary {
  status: "success" | "reverted";
  blockNumber: bigint;
}

/**
 * Narrow chain-access surface used by the verification engine. Unit tests inject
 * a mock and never touch a real RPC.
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
  /** Independent event-log scan filtered on `Anchored(hash)` / `MerkleRootAnchored(root)`. */
  getAnchoredLogs(hash: Hex32, opts?: { fromBlock?: bigint }): Promise<AnchoredLog[]>;
  /** Fetch a tx receipt; null if the tx is no longer found (reorg). */
  getTransactionReceipt(txHash: Hex32): Promise<TxReceiptSummary | null>;
}

/** The zero address denotes "no record" in the registry mapping. */
export const ZERO_ADDRESS: Address = "0x0000000000000000000000000000000000000000";

function decodeAnchoredLogsFromReceipt(
  abi: Abi,
  logs: Parameters<typeof parseEventLogs>[0]["logs"],
  blockNumber: bigint,
  blockTimestamp: bigint,
): AnchoredLog[] {
  const parsed = parseEventLogs({
    abi,
    logs,
    eventName: ["Anchored", "MerkleRootAnchored"],
  });
  return parsed.map((log) => {
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
      blockTimestamp,
      blockNumber,
    };
  });
}

/** viem-backed implementation against a deployed `AnchorRegistry`. */
export class ViemRegistryClient implements RegistryClient {
  readonly chainId: number;
  private readonly abi: Abi;
  private readonly address: Address;
  private readonly publicClient: PublicClient;
  private readonly walletClient?: WalletClient;
  private readonly account?: Account;
  private readonly logScanMaxRange: bigint;
  private readonly logScanLookback: bigint;

  constructor(config: Config) {
    this.chainId = config.chainId;
    this.address = config.registryAddress;
    this.abi = loadAnchorRegistryArtifact().abi;
    this.logScanMaxRange = BigInt(config.logScanMaxRange ?? DEFAULT_LOG_SCAN_MAX_RANGE);
    this.logScanLookback = BigInt(config.logScanLookback ?? DEFAULT_LOG_SCAN_LOOKBACK);

    const chain = defineChain({
      id: config.chainId,
      name: `chain-${config.chainId}`,
      nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
      rpcUrls: { default: { http: [config.rpcUrl] } },
    });

    // Retry/backoff so transient rate-limits (e.g. free-tier 429s) don't turn
    // into a definitive RPC_ERROR; viem retries 429/5xx with exponential backoff.
    const transport = http(config.rpcUrl, { retryCount: 6, retryDelay: 500 });

    this.publicClient = createPublicClient({
      chain,
      transport,
      cacheTime: 0,
    });

    if (config.anchorerPrivateKey) {
      this.account = privateKeyToAccount(config.anchorerPrivateKey);
      this.walletClient = createWalletClient({
        account: this.account,
        chain,
        transport,
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
    return decodeAnchoredLogsFromReceipt(
      this.abi,
      receipt.logs,
      receipt.blockNumber,
      block.timestamp,
    );
  }

  private async getLogsInWindow(hash: Hex32, fromBlock: bigint, toBlock: bigint) {
    const [directLogs, merkleLogs] = await Promise.all([
      this.publicClient.getLogs({
        address: this.address,
        event: {
          type: "event",
          name: "Anchored",
          inputs: [
            { type: "bytes32", indexed: true, name: "hash" },
            { type: "address", indexed: true, name: "anchorer" },
            { type: "uint8", indexed: false, name: "algo" },
            { type: "bool", indexed: false, name: "isMerkleRoot" },
            { type: "uint64", indexed: false, name: "blockTimestamp" },
          ],
        },
        args: { hash },
        fromBlock,
        toBlock,
      }),
      this.publicClient.getLogs({
        address: this.address,
        event: {
          type: "event",
          name: "MerkleRootAnchored",
          inputs: [
            { type: "bytes32", indexed: true, name: "root" },
            { type: "address", indexed: true, name: "anchorer" },
            { type: "uint8", indexed: false, name: "algo" },
            { type: "uint64", indexed: false, name: "blockTimestamp" },
          ],
        },
        args: { root: hash },
        fromBlock,
        toBlock,
      }),
    ]);
    return [...directLogs, ...merkleLogs];
  }

  /**
   * Independent event-log scan. Chunks the `eth_getLogs` query into windows of
   * `logScanMaxRange` blocks (to respect provider range caps, e.g. Alchemy's
   * free tier 10-block limit) and walks newest→oldest with early exit on the
   * first matching window.
   */
  async getAnchoredLogs(hash: Hex32, opts?: { fromBlock?: bigint }): Promise<AnchoredLog[]> {
    const head = await this.publicClient.getBlockNumber();

    const lookbackFloor =
      this.logScanLookback > 0n && head > this.logScanLookback
        ? head - this.logScanLookback
        : 0n;
    const minBlock = opts?.fromBlock ?? lookbackFloor;

    const step = this.logScanMaxRange;
    let allRaw: Awaited<ReturnType<ViemRegistryClient["getLogsInWindow"]>> = [];

    let toBlock = head;
    while (toBlock >= minBlock) {
      const windowStart = toBlock - step + 1n;
      const fromBlock = windowStart > minBlock ? windowStart : minBlock;

      const raw = await this.getLogsInWindow(hash, fromBlock, toBlock);
      if (raw.length > 0) {
        allRaw = raw;
        break;
      }

      if (fromBlock === minBlock) break;
      toBlock = fromBlock - 1n;
    }

    if (allRaw.length === 0) return [];

    const blockNumbers = [...new Set(allRaw.map((l) => l.blockNumber))];
    const blocks = await Promise.all(
      blockNumbers.map((bn) => this.publicClient.getBlock({ blockNumber: bn })),
    );
    const tsByBlock = new Map(blocks.map((b) => [b.number, b.timestamp]));

    const results: AnchoredLog[] = [];
    for (const raw of allRaw) {
      const decoded = decodeAnchoredLogsFromReceipt(
        this.abi,
        [raw],
        raw.blockNumber,
        tsByBlock.get(raw.blockNumber) ?? 0n,
      );
      results.push(...decoded);
    }

    results.sort((a, b) => {
      if (a.blockNumber !== b.blockNumber) {
        return a.blockNumber < b.blockNumber ? -1 : 1;
      }
      return 0;
    });
    return results;
  }

  async getTransactionReceipt(txHash: Hex32): Promise<TxReceiptSummary | null> {
    try {
      const receipt = await this.publicClient.getTransactionReceipt({ hash: txHash });
      return {
        status: receipt.status,
        blockNumber: receipt.blockNumber,
      };
    } catch {
      return null;
    }
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

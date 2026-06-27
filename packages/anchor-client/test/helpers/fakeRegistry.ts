import { merkle, type Hex32 } from "@onchain-agent/hash-core";
import type { Address } from "viem";
import type {
  AnchorRecord,
  AnchoredLog,
  AnchorWriteResult,
  RegistryClient,
  TxReceiptSummary,
} from "../../src/registryClient.js";

export const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000" as Address;
const ZERO_HASH = `0x${"0".repeat(64)}` as Hex32;
export const FAKE_ANCHORER = "0x00000000000000000000000000000000000000a1" as Address;

const ZERO_RECORD: AnchorRecord = {
  anchorer: ZERO_ADDRESS,
  blockTimestamp: 0n,
  blockNumber: 0n,
  algo: 0,
  isMerkleRoot: false,
  metadataHash: ZERO_HASH,
};

export interface SeedRecord {
  hash: Hex32;
  algo: number;
  isMerkleRoot?: boolean;
  blockNumber: number;
  blockTimestamp: number;
  anchorer?: Address;
  metadataHash?: Hex32;
}

/**
 * In-memory `RegistryClient` for unit/fuzz tests. Stores records in a Map,
 * mirrors first-seen-wins, decodes Merkle proofs with hash-core, and can be
 * told to throw on reads to exercise the RPC_ERROR path.
 */
export class FakeRegistry implements RegistryClient {
  chainId: number;
  head: bigint;
  throwOnRead = false;

  private readonly records = new Map<string, AnchorRecord>();
  private readonly txLogs = new Map<string, AnchoredLog[]>();
  private readonly logsByHash = new Map<string, AnchoredLog[]>();
  private readonly receipts = new Map<string, TxReceiptSummary>();
  private txCounter = 0n;

  constructor(opts?: { chainId?: number; head?: bigint }) {
    this.chainId = opts?.chainId ?? 80002;
    this.head = opts?.head ?? 100n;
  }

  /** Pre-seed an anchored record (no transaction). */
  seed(rec: SeedRecord): this {
    this.records.set(rec.hash.toLowerCase(), {
      anchorer: rec.anchorer ?? FAKE_ANCHORER,
      blockTimestamp: BigInt(rec.blockTimestamp),
      blockNumber: BigInt(rec.blockNumber),
      algo: rec.algo,
      isMerkleRoot: rec.isMerkleRoot ?? false,
      metadataHash: rec.metadataHash ?? ZERO_HASH,
    });
    return this;
  }

  /** Pre-seed the decoded logs returned for a given tx hash. */
  seedTxLogs(txHash: Hex32, logs: AnchoredLog[]): this {
    this.txLogs.set(txHash.toLowerCase(), logs);
    return this;
  }

  /** Pre-seed event logs returned by `getAnchoredLogs` for a hash. */
  seedAnchoredLogs(hash: Hex32, logs: AnchoredLog[]): this {
    this.logsByHash.set(hash.toLowerCase(), logs);
    return this;
  }

  /** Pre-seed a tx receipt for reorg tests. */
  seedReceipt(txHash: Hex32, receipt: TxReceiptSummary | null): this {
    const key = txHash.toLowerCase();
    if (receipt === null) {
      this.receipts.delete(key);
    } else {
      this.receipts.set(key, receipt);
    }
    return this;
  }

  private maybeThrow(): void {
    if (this.throwOnRead) throw new Error("simulated RPC failure");
  }

  async isAnchored(hash: Hex32): Promise<boolean> {
    this.maybeThrow();
    return this.records.has(hash.toLowerCase());
  }

  async getRecord(hash: Hex32): Promise<AnchorRecord> {
    this.maybeThrow();
    return this.records.get(hash.toLowerCase()) ?? ZERO_RECORD;
  }

  async verifyMerkle(root: Hex32, leaf: Hex32, proof: Hex32[]): Promise<boolean> {
    this.maybeThrow();
    return merkle.verify(leaf, root, proof);
  }

  async anchor(hash: Hex32, algo: number, metadataHash: Hex32): Promise<AnchorWriteResult> {
    return this.write(hash, algo, metadataHash, false);
  }

  async anchorMerkleRoot(
    root: Hex32,
    algo: number,
    metadataHash: Hex32,
  ): Promise<AnchorWriteResult> {
    return this.write(root, algo, metadataHash, true);
  }

  async getHeadBlockNumber(): Promise<bigint> {
    this.maybeThrow();
    return this.head;
  }

  async parseAnchoredLogs(txHash: Hex32): Promise<AnchoredLog[]> {
    this.maybeThrow();
    return this.txLogs.get(txHash.toLowerCase()) ?? [];
  }

  async getAnchoredLogs(hash: Hex32): Promise<AnchoredLog[]> {
    this.maybeThrow();
    const key = hash.toLowerCase();
    if (this.logsByHash.has(key)) {
      return this.logsByHash.get(key) ?? [];
    }
    // Default: derive logs from stored records when not explicitly seeded.
    const rec = this.records.get(key);
    if (!rec || rec.anchorer === ZERO_ADDRESS) return [];
    return [
      {
        hash,
        anchorer: rec.anchorer,
        algo: rec.algo,
        isMerkleRoot: rec.isMerkleRoot,
        blockTimestamp: rec.blockTimestamp,
        blockNumber: rec.blockNumber,
      },
    ];
  }

  async getTransactionReceipt(txHash: Hex32): Promise<TxReceiptSummary | null> {
    this.maybeThrow();
    const key = txHash.toLowerCase();
    if (this.receipts.has(key)) {
      return this.receipts.get(key) ?? null;
    }
    if (this.txLogs.has(key)) {
      const logs = this.txLogs.get(key)!;
      const blockNumber = logs[0]?.blockNumber ?? this.head;
      return { status: "success", blockNumber };
    }
    return null;
  }

  private write(
    hash: Hex32,
    algo: number,
    metadataHash: Hex32,
    isMerkleRoot: boolean,
  ): AnchorWriteResult {
    const key = hash.toLowerCase();
    if (this.records.has(key)) {
      throw new Error(`AlreadyAnchored: ${hash}`);
    }
    const blockNumber = this.head;
    const blockTimestamp = 1_750_000_000n + this.txCounter;
    const log: AnchoredLog = {
      hash,
      anchorer: FAKE_ANCHORER,
      algo,
      isMerkleRoot,
      blockTimestamp,
      blockNumber,
    };
    this.records.set(key, {
      anchorer: FAKE_ANCHORER,
      blockTimestamp,
      blockNumber,
      algo,
      isMerkleRoot,
      metadataHash,
    });
    this.logsByHash.set(key, [log]);
    const txHash = `0x${(this.txCounter + 1n).toString(16).padStart(64, "0")}` as Hex32;
    this.txCounter += 1n;
    this.txLogs.set(txHash.toLowerCase(), [log]);
    this.receipts.set(txHash.toLowerCase(), { status: "success", blockNumber });
    return { txHash, blockNumber, blockTimestamp, anchorer: FAKE_ANCHORER };
  }
}

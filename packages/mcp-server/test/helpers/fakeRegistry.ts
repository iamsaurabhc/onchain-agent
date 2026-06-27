import { merkle, type Hex32 } from "@onchain-agent/hash-core";
import type { Address } from "viem";
import type {
  AnchorRecord,
  AnchoredLog,
  AnchorWriteResult,
  RegistryClient,
} from "../../src/registryClient.js";

export const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000" as Address;
const ZERO_HASH = `0x${"0".repeat(64)}` as Hex32;
/** Deterministic default anchorer for the fake (lowercase for easy fixture diffs). */
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
    this.records.set(key, {
      anchorer: FAKE_ANCHORER,
      blockTimestamp,
      blockNumber,
      algo,
      isMerkleRoot,
      metadataHash,
    });
    const txHash = `0x${(this.txCounter + 1n).toString(16).padStart(64, "0")}` as Hex32;
    this.txCounter += 1n;
    this.txLogs.set(txHash.toLowerCase(), [
      { hash, anchorer: FAKE_ANCHORER, algo, isMerkleRoot, blockTimestamp, blockNumber },
    ]);
    return { txHash, blockNumber, blockTimestamp, anchorer: FAKE_ANCHORER };
  }
}

import type { Config, RegistryClient } from "@onchain-agent/anchor-client";
import type { Hex32 } from "@onchain-agent/hash-core";
import type { VerificationResult } from "@onchain-agent/anchor-client";
import type { DeriveInput } from "./derive.js";
import { verifyByHash } from "./methods/byHash.js";
import { verifyByPayload } from "./methods/byPayload.js";
import { verifyByTx } from "./methods/byTx.js";
import { verifyByMerkle, type MerkleVerifyInput } from "./methods/byMerkle.js";
import { verifyByLogScan } from "./methods/byLogScan.js";

export type { DeriveInput } from "./derive.js";
export type { MerkleVerifyInput } from "./methods/byMerkle.js";
export { deriveDirectHash } from "./derive.js";
export { finalizeAnchored } from "./finality.js";
export { withRpcErrorBoundary } from "./rpcBoundary.js";

/**
 * Unified verification engine (Phase E): all six methods + finality gate.
 * Asserts `client.chainId === config.chainId` at construction (§5.6).
 */
export class VerificationEngine {
  private readonly client: RegistryClient;
  private readonly config: Config;

  constructor(client: RegistryClient, config: Config) {
    if (client.chainId !== config.chainId) {
      throw new Error(
        `chainId mismatch: client reports ${client.chainId}, config expects ${config.chainId}`,
      );
    }
    this.client = client;
    this.config = config;
  }

  verifyByHash(input: { hash: Hex32; crossCheckLogs?: boolean }): Promise<VerificationResult> {
    return verifyByHash(this.client, this.config, input);
  }

  verifyByPayload(input: DeriveInput & { claimedHash?: Hex32 }): Promise<VerificationResult> {
    return verifyByPayload(this.client, this.config, input);
  }

  verifyByTx(input: { txHash: Hex32; expectedHash?: Hex32 }): Promise<VerificationResult> {
    return verifyByTx(this.client, this.config, input);
  }

  verifyByMerkle(input: MerkleVerifyInput): Promise<VerificationResult> {
    return verifyByMerkle(this.client, this.config, input);
  }

  verifyByLogScan(input: { hash: Hex32 }): Promise<VerificationResult> {
    return verifyByLogScan(this.client, this.config, input);
  }
}

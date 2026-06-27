import type { Config, RegistryClient, PayloadEncoding } from "@onchain-agent/anchor-client";
import { decodeBytes } from "@onchain-agent/anchor-client";
import { fail, Reason, type VerificationResult } from "@onchain-agent/anchor-client";
import { merkle, type Hex32 } from "@onchain-agent/hash-core";
import { finalizeAnchored } from "../finality.js";
import { withRpcErrorBoundary } from "../rpcBoundary.js";

export interface MerkleVerifyInput {
  root: Hex32;
  proof: Hex32[];
  leaf?: Hex32;
  leafPayload?: string;
  encoding: PayloadEncoding;
}

export async function verifyByMerkle(
  client: RegistryClient,
  config: Config,
  input: MerkleVerifyInput,
): Promise<VerificationResult> {
  const root = input.root;
  const leaf: Hex32 = input.leaf
    ? input.leaf
    : merkle.leafHash(decodeBytes(input.leafPayload as string, input.encoding));
  const proof = input.proof;

  return withRpcErrorBoundary("by_merkle", client.chainId, async () => {
    const proofOk = await client.verifyMerkle(root, leaf, proof);
    if (!proofOk) {
      return fail({
        method: "by_merkle",
        reason: Reason.MERKLE_PROOF_INVALID,
        chainId: client.chainId,
        hash: root,
      });
    }

    const anchored = await client.isAnchored(root);
    if (!anchored) {
      return fail({
        method: "by_merkle",
        reason: Reason.ROOT_NOT_ANCHORED,
        chainId: client.chainId,
        hash: root,
      });
    }

    const record = await client.getRecord(root);
    return finalizeAnchored({
      client,
      config,
      method: "by_merkle",
      hash: root,
      anchorer: record.anchorer,
      blockNumber: record.blockNumber,
      blockTimestamp: record.blockTimestamp,
    });
  });
}

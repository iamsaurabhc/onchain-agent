import type { Config } from "../config.js";
import type { RegistryClient } from "../registryClient.js";
import { makeAnchorHash } from "./anchorHash.js";
import { makeGetAnchor } from "./getAnchor.js";
import { makeVerifyByTx } from "./verifyByTx.js";
import { makeVerifyHash } from "./verifyHash.js";
import { makeVerifyMerkleProof } from "./verifyMerkleProof.js";

/**
 * Build the five Phase D MCP tools bound to a `RegistryClient` + `Config`.
 * Tests inject a mock client; the server binds the viem-backed client.
 */
export function createTools(client: RegistryClient, config: Config) {
  return {
    anchor_hash: makeAnchorHash(client, config),
    verify_hash: makeVerifyHash(client, config),
    get_anchor: makeGetAnchor(client, config),
    verify_merkle_proof: makeVerifyMerkleProof(client, config),
    verify_by_tx: makeVerifyByTx(client, config),
  };
}

export type AnchorTools = ReturnType<typeof createTools>;

export { makeAnchorHash } from "./anchorHash.js";
export { makeGetAnchor } from "./getAnchor.js";
export { makeVerifyByTx } from "./verifyByTx.js";
export { makeVerifyHash } from "./verifyHash.js";
export { makeVerifyMerkleProof } from "./verifyMerkleProof.js";

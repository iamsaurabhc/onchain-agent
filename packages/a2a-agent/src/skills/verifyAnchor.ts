import type { VerificationResult } from "@onchain-agent/anchor-client";
import type { CodecId, Hex32 } from "@onchain-agent/hash-core";
import type { PayloadEncoding } from "@onchain-agent/anchor-client";
import type { AnchorToolset } from "../toolset.js";
import {
  verifyAnchorInputSchema,
  type VerifyAnchorInput,
} from "../schemas.js";

/**
 * Deterministic verify-anchor skill core (Phase F).
 * Routes by `method` to the matching Phase D MCP tool and returns §5.1 results
 * with §5.2 reason taxonomy unchanged.
 */
export async function verifyAnchor(
  toolset: AnchorToolset,
  input: VerifyAnchorInput,
): Promise<VerificationResult> {
  const parsed = verifyAnchorInputSchema.parse(input);

  switch (parsed.method) {
    case "by_payload":
      return toolset.verifyHash({
        payload: parsed.payload,
        codecId: parsed.codecId as CodecId,
        algo: parsed.algo,
        encoding: parsed.encoding as PayloadEncoding,
        salt: parsed.salt as Hex32 | undefined,
        claimedHash: parsed.claimedHash as Hex32 | undefined,
      });

    case "by_hash":
      return toolset.getAnchor({
        hash: parsed.hash as Hex32,
        crossCheckLogs: parsed.crossCheckLogs,
      });

    case "by_tx":
      return toolset.verifyByTx({
        txHash: parsed.txHash as Hex32,
        expectedHash: parsed.expectedHash as Hex32 | undefined,
      });

    case "by_merkle":
      return toolset.verifyMerkleProof({
        root: parsed.root as Hex32,
        proof: parsed.proof as Hex32[],
        leaf: parsed.leaf as Hex32 | undefined,
        leafPayload: parsed.leafPayload,
        encoding: parsed.encoding as PayloadEncoding,
      });

    case "by_log":
      return toolset.verifyByLog({ hash: parsed.hash as Hex32 });
  }
}

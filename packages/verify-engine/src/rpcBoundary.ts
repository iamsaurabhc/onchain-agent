import type { VerificationMethod, VerificationResult } from "@onchain-agent/anchor-client";
import { fail, Reason } from "@onchain-agent/anchor-client";

/** Wrap a verification body so any RPC/transport failure becomes RPC_ERROR (§5.2). */
export async function withRpcErrorBoundary(
  method: VerificationMethod,
  chainId: number,
  body: () => Promise<VerificationResult>,
): Promise<VerificationResult> {
  try {
    return await body();
  } catch {
    return fail({
      method,
      reason: Reason.RPC_ERROR,
      chainId,
    });
  }
}

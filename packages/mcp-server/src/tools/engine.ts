import type { Config, RegistryClient } from "@onchain-agent/anchor-client";
import { VerificationEngine } from "@onchain-agent/verify-engine";

/** Shared engine instance factory for MCP tool wrappers. */
export function createEngine(client: RegistryClient, config: Config): VerificationEngine {
  return new VerificationEngine(client, config);
}

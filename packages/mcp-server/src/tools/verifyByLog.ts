import { createTool } from "@mastra/core/tools";
import { z } from "zod";
import type { Hex32 } from "@onchain-agent/hash-core";
import type { Config, RegistryClient } from "@onchain-agent/anchor-client";
import { createEngine } from "./engine.js";
import { hex32, verificationResultSchema } from "./schemas.js";

/**
 * `verify_by_log` — verify by event-log scan (§5 method 5). Queries
 * `eth_getLogs` independently of storage; does not trust `getRecord`.
 */
export function makeVerifyByLog(client: RegistryClient, config: Config) {
  const engine = createEngine(client, config);
  return createTool({
    id: "verify_by_log",
    description:
      "Verify anchoring via independent event-log scan (eth_getLogs). Does not " +
      "trust storage getters; cross-check path for higher assurance.",
    inputSchema: z.object({
      hash: hex32,
    }),
    outputSchema: verificationResultSchema,
    execute: async ({ context }) =>
      engine.verifyByLogScan({ hash: context.hash as Hex32 }),
  });
}

export type VerifyByLogResult = ReturnType<typeof makeVerifyByLog>;

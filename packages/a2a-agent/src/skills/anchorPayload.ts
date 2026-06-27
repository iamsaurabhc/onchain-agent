import type { AnchorToolset } from "../toolset.js";
import { toAnchorHashInput } from "../toolset.js";
import {
  anchorPayloadInputSchema,
  type AnchorPayloadInput,
  type AnchorPayloadOutput,
} from "../schemas.js";

/**
 * Deterministic anchor-payload skill core (Phase F).
 * Pure translation: A2A task → MCP `anchor_hash` → schema-conformant result.
 * No policy logic (info.md §5.2).
 */
export async function anchorPayload(
  toolset: AnchorToolset,
  input: AnchorPayloadInput,
): Promise<AnchorPayloadOutput> {
  const parsed = anchorPayloadInputSchema.parse(input);
  return toolset.anchorHash(toAnchorHashInput(parsed));
}

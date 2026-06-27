import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import type { Abi, Hex } from "viem";

const here = dirname(fileURLToPath(import.meta.url));
// packages/anchor-client/src -> packages/anchor-client -> packages -> repo root
const ARTIFACT = join(
  here,
  "..",
  "..",
  "..",
  "contracts",
  "out",
  "AnchorRegistry.sol",
  "AnchorRegistry.json",
);

export interface AnchorRegistryArtifact {
  abi: Abi;
  bytecode: Hex;
}

interface ForgeArtifact {
  abi: Abi;
  bytecode: { object: Hex };
}

/**
 * Load the compiled `AnchorRegistry` ABI (and creation bytecode) from the
 * Foundry artifact. Requires `forge build --root contracts` to have run.
 */
export function loadAnchorRegistryArtifact(): AnchorRegistryArtifact {
  const artifact: ForgeArtifact = JSON.parse(readFileSync(ARTIFACT, "utf8"));
  return { abi: artifact.abi, bytecode: artifact.bytecode.object };
}

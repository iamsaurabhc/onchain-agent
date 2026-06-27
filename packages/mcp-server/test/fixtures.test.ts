import { readFileSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import type { Hex32 } from "@onchain-agent/hash-core";
import type { Address } from "viem";
import { createTools } from "../src/tools/index.js";
import type { AnchoredLog } from "../src/registryClient.js";
import { FakeRegistry } from "./helpers/fakeRegistry.js";
import { runTool, testConfig } from "./helpers/run.js";

const here = dirname(fileURLToPath(import.meta.url));
const FIXTURES = join(here, "fixtures");

type ToolName =
  | "anchor_hash"
  | "verify_hash"
  | "get_anchor"
  | "verify_merkle_proof"
  | "verify_by_tx";

interface SeedEntry {
  hash: Hex32;
  algo: number;
  isMerkleRoot?: boolean;
  blockNumber: number;
  blockTimestamp: number;
  anchorer?: Address;
  metadataHash?: Hex32;
}

interface TxLogEntry {
  txHash: Hex32;
  logs: Array<{
    hash: Hex32;
    anchorer: Address;
    algo: number;
    isMerkleRoot: boolean;
    blockTimestamp: number;
    blockNumber: number;
  }>;
}

interface FixtureInput {
  tool: ToolName;
  args: Record<string, unknown>;
  setup?: {
    head?: number;
    confirmations?: number;
    throwOnRead?: boolean;
    seed?: SeedEntry[];
    txLogs?: TxLogEntry[];
  };
}

function buildRegistry(setup: FixtureInput["setup"]): FakeRegistry {
  const client = new FakeRegistry({ head: BigInt(setup?.head ?? 100) });
  for (const s of setup?.seed ?? []) client.seed(s);
  for (const t of setup?.txLogs ?? []) {
    const logs: AnchoredLog[] = t.logs.map((l) => ({
      hash: l.hash,
      anchorer: l.anchorer,
      algo: l.algo,
      isMerkleRoot: l.isMerkleRoot,
      blockTimestamp: BigInt(l.blockTimestamp),
      blockNumber: BigInt(l.blockNumber),
    }));
    client.seedTxLogs(t.txHash, logs);
  }
  if (setup?.throwOnRead) client.throwOnRead = true;
  return client;
}

// Each tool dir holds <case>.input.json / <case>.output.json golden pairs.
const toolDirs = readdirSync(FIXTURES, { withFileTypes: true })
  .filter((d) => d.isDirectory())
  .map((d) => d.name);

describe("golden request/response fixtures", () => {
  for (const tool of toolDirs) {
    const dir = join(FIXTURES, tool);
    const cases = readdirSync(dir)
      .filter((f) => f.endsWith(".input.json"))
      .map((f) => f.replace(/\.input\.json$/, ""));

    for (const name of cases) {
      it(`${tool}/${name}`, async () => {
        const input: FixtureInput = JSON.parse(
          readFileSync(join(dir, `${name}.input.json`), "utf8"),
        );
        const expected = JSON.parse(
          readFileSync(join(dir, `${name}.output.json`), "utf8"),
        );

        const client = buildRegistry(input.setup);
        const tools = createTools(
          client,
          testConfig({ confirmations: input.setup?.confirmations ?? 1 }),
        );

        const result = await runTool(tools[input.tool], input.args);
        expect(result).toEqual(expected);
      });
    }
  }
});

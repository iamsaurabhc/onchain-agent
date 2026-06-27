import { readFileSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import type { Hex32 } from "@onchain-agent/hash-core";
import type { Address } from "viem";
import type { Config } from "@onchain-agent/anchor-client";
import {
  FakeRegistry,
  FAKE_ANCHORER,
  type SeedRecord,
} from "@onchain-agent/anchor-client/test/fakeRegistry";
import { VerificationEngine } from "../src/engine.js";

const here = dirname(fileURLToPath(import.meta.url));
const FIXTURES = join(here, "..", "..", "..", "fixtures", "verify_cases");

type VerifyMethod =
  | "by_hash"
  | "by_payload"
  | "by_tx"
  | "by_merkle"
  | "by_log_scan";

interface MockAnchoredLog {
  hash: Hex32;
  algo: number;
  isMerkleRoot: boolean;
  blockNumber: number;
  blockTimestamp: number;
  anchorer?: Address;
}

interface VerifyCaseFixture {
  id: string;
  method: VerifyMethod;
  input: Record<string, unknown>;
  mock: {
    head?: number;
    confirmationsRequired?: number;
    throwOnRead?: boolean;
    records?: SeedRecord[];
    anchoredLogs?: MockAnchoredLog[];
  };
  expected: Record<string, unknown>;
}

function buildRegistry(mock: VerifyCaseFixture["mock"]): FakeRegistry {
  const client = new FakeRegistry({ head: BigInt(mock.head ?? 100) });
  for (const rec of mock.records ?? []) client.seed(rec);
  if (mock.anchoredLogs !== undefined) {
    if (mock.anchoredLogs.length === 0) {
      const hashes = (mock.records ?? []).map((r) => r.hash);
      const inputHash = hashes.length > 0 ? hashes : [];
      for (const hash of inputHash) client.seedAnchoredLogs(hash, []);
    } else {
      for (const log of mock.anchoredLogs) {
        client.seedAnchoredLogs(log.hash, [
          {
            hash: log.hash,
            anchorer: log.anchorer ?? FAKE_ANCHORER,
            algo: log.algo,
            isMerkleRoot: log.isMerkleRoot,
            blockTimestamp: BigInt(log.blockTimestamp),
            blockNumber: BigInt(log.blockNumber),
          },
        ]);
      }
    }
  }
  if (mock.throwOnRead) client.throwOnRead = true;
  return client;
}

function testConfig(over?: Partial<Config>): Config {
  return {
    rpcUrl: "http://127.0.0.1:8545",
    chainId: 80002,
    registryAddress: "0x0000000000000000000000000000000000000abc",
    confirmations: 1,
    ...over,
  };
}

async function runCase(fixture: VerifyCaseFixture) {
  const client = buildRegistry(fixture.mock);
  const config = testConfig({
    confirmations: fixture.mock.confirmationsRequired ?? 1,
  });
  const engine = new VerificationEngine(client, config);

  switch (fixture.method) {
    case "by_hash":
      return engine.verifyByHash(fixture.input as { hash: Hex32; crossCheckLogs?: boolean });
    case "by_payload":
      return engine.verifyByPayload(
        fixture.input as Parameters<VerificationEngine["verifyByPayload"]>[0],
      );
    case "by_merkle":
      return engine.verifyByMerkle(
        fixture.input as Parameters<VerificationEngine["verifyByMerkle"]>[0],
      );
    case "by_log_scan": {
      const hash = fixture.input.hash as Hex32;
      if (
        fixture.mock.anchoredLogs?.length === 0 &&
        (fixture.mock.records ?? []).length === 0
      ) {
        client.seedAnchoredLogs(hash, []);
      }
      return engine.verifyByLogScan({ hash });
    }
    default:
      throw new Error(`unsupported method in fixture: ${fixture.method}`);
  }
}

const manifest = JSON.parse(
  readFileSync(join(FIXTURES, "manifest.json"), "utf8"),
) as { cases: string[] };

describe("verify_cases golden fixtures", () => {
  for (const id of manifest.cases) {
    it(id, async () => {
      const fixture: VerifyCaseFixture = JSON.parse(
        readFileSync(join(FIXTURES, `${id}.json`), "utf8"),
      );
      const result = await runCase(fixture);
      expect(result).toEqual(fixture.expected);
    });
  }
});

describe("verify_cases directory completeness", () => {
  it("manifest lists every fixture file", () => {
    const files = readdirSync(FIXTURES)
      .filter((f) => f.endsWith(".json") && f !== "manifest.json")
      .map((f) => f.replace(/\.json$/, ""));
    expect(manifest.cases.sort()).toEqual(files.sort());
  });
});

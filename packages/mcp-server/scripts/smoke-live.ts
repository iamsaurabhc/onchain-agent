#!/usr/bin/env node
/**
 * Live smoke test: run MCP tools directly against the chain configured in
 * `.env.local` (repo root or package). No Cursor required.
 *
 * Covers:
 * - anchor_hash → verify_hash happy path
 * - adversarial claimed hash (HASH_MISMATCH)
 * - never-anchored payload (NOT_FOUND)
 * - anchor without signer fails when ANCHORER_PRIVATE_KEY is unset
 */
import { loadLocalEnv } from "../src/loadEnv.js";
import { loadConfig } from "../src/config.js";
import { ViemRegistryClient } from "../src/registryClient.js";
import { createTools } from "../src/tools/index.js";
import { runTool } from "../test/helpers/run.js";

loadLocalEnv(import.meta.url);

function pass(label: string): void {
  console.log(`  ✓ ${label}`);
}

function fail(label: string, detail?: unknown): void {
  console.error(`  ✗ ${label}`, detail ?? "");
  process.exitCode = 1;
}

async function main(): Promise<void> {
  console.log("onchain-anchor smoke (live tools, no MCP stdio)\n");

  const config = loadConfig();
  // Smoke tests verify tool logic, not 64-block finality — use 1 confirmation here.
  const smokeConfig = { ...config, confirmations: 1 };
  console.log(`  chainId=${smokeConfig.chainId} registry=${smokeConfig.registryAddress}`);
  console.log(`  confirmations=${smokeConfig.confirmations} (smoke override; env had ${config.confirmations})\n`);

  const client = new ViemRegistryClient(smokeConfig);
  const tools = createTools(client, smokeConfig);

  const payload = `smoke-${Date.now()}`;
  const args = { payload, codecId: "raw", algo: 1, encoding: "utf8" };

  // 1. Anchor + verify round-trip
  try {
    const anchored = await runTool(tools.anchor_hash, args);
    if (!anchored.hash || !anchored.txHash) {
      fail("anchor_hash returned incomplete result", anchored);
    } else {
      pass(`anchor_hash → hash ${anchored.hash.slice(0, 14)}…`);
    }

    const verified = await runTool(tools.verify_hash, {
      ...args,
      claimedHash: anchored.hash,
    });
    if (verified.verified !== true || verified.reason !== null) {
      fail("verify_hash after anchor", verified);
    } else {
      pass("verify_hash → verified:true after anchor");
    }

    const byTx = await runTool(tools.verify_by_tx, {
      txHash: anchored.txHash,
      expectedHash: anchored.hash,
    });
    if (byTx.verified !== true) {
      fail("verify_by_tx", byTx);
    } else {
      pass("verify_by_tx → verified:true");
    }
  } catch (err) {
    fail("anchor/verify round-trip threw", err);
  }

  // 2. Adversarial: wrong claimed hash must not verify as anchored
  try {
    const bad = await runTool(tools.verify_hash, {
      ...args,
      payload: "different-payload",
      claimedHash: `0x${"ab".repeat(32)}`,
    });
    if (bad.verified !== false || bad.reason !== "HASH_MISMATCH") {
      fail("adversarial claimedHash should be HASH_MISMATCH", bad);
    } else {
      pass("adversarial claimedHash → HASH_MISMATCH (cannot fake verify)");
    }
  } catch (err) {
    fail("adversarial verify threw", err);
  }

  // 3. Never anchored
  try {
    const missing = await runTool(tools.verify_hash, {
      payload: `never-${Date.now()}`,
      codecId: "raw",
      algo: 1,
      encoding: "utf8",
    });
    if (missing.verified !== false || missing.reason !== "NOT_FOUND") {
      fail("never-anchored should be NOT_FOUND", missing);
    } else {
      pass("never-anchored payload → NOT_FOUND");
    }
  } catch (err) {
    fail("never-anchored verify threw", err);
  }

  // 4. Write path requires server-side signer (not in tool args)
  if (!config.anchorerPrivateKey) {
    try {
      await runTool(tools.anchor_hash, {
        payload: "should-fail",
        codecId: "raw",
        algo: 1,
      });
      fail("anchor_hash without signer should throw");
    } catch {
      pass("anchor_hash without ANCHORER_PRIVATE_KEY rejected");
    }
  } else {
    pass("ANCHORER_PRIVATE_KEY present (write path enabled)");
  }

  console.log(
    process.exitCode === 1
      ? "\nSmoke FAILED — see errors above."
      : "\nSmoke PASSED — tools + chain config look good.",
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

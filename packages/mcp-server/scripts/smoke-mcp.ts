#!/usr/bin/env node
/**
 * MCP stdio smoke test: spawns the real MCPServer subprocess and calls tools
 * via @modelcontextprotocol/sdk (same path Cursor uses). No IDE required.
 */
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { findMcpServerRoot, loadLocalEnv } from "../src/loadEnv.js";
import { join } from "node:path";

loadLocalEnv(import.meta.url);

function pass(label: string): void {
  console.log(`  ✓ ${label}`);
}

function fail(label: string, detail?: unknown): void {
  console.error(`  ✗ ${label}`, detail ?? "");
  process.exitCode = 1;
}

function parseToolJson(result: unknown): unknown {
  const r = result as { content?: Array<{ type: string; text?: string }> };
  const text = r.content?.find((c) => c.type === "text")?.text;
  if (!text) throw new Error("tool result had no text content");
  return JSON.parse(text);
}

async function main(): Promise<void> {
  console.log("onchain-anchor smoke (MCP stdio client → server)\n");

  const pkgRoot = findMcpServerRoot(import.meta.url);
  const serverEntry = join(pkgRoot, "src", "server.ts");

  const childEnv = Object.fromEntries(
    Object.entries({ ...process.env, CONFIRMATIONS: "1" }).filter(
      ([, v]) => v !== undefined,
    ) as [string, string][],
  );

  const transport = new StdioClientTransport({
    command: "tsx",
    args: [serverEntry],
    cwd: pkgRoot,
    env: childEnv,
    stderr: "pipe",
  });

  const client = new Client({ name: "smoke-client", version: "0.1.0" });
  await client.connect(transport);

  try {
    const { tools } = await client.listTools();
    const names = tools.map((t) => t.name).sort();
    const expected = [
      "anchor_hash",
      "get_anchor",
      "verify_by_tx",
      "verify_hash",
      "verify_merkle_proof",
    ];
    if (names.join(",") !== expected.join(",")) {
      fail("listTools unexpected tool set", names);
    } else {
      pass(`listTools → ${names.length} tools exposed`);
    }

    const payload = `mcp-smoke-${Date.now()}`;
    const anchorResult = await client.callTool({
      name: "anchor_hash",
      arguments: { payload, codecId: "raw", algo: 1, encoding: "utf8" },
    });
    const anchored = parseToolJson(anchorResult) as {
      hash: string;
      txHash: string;
    };
    if (!anchored.hash || !anchored.txHash) {
      fail("MCP anchor_hash", anchored);
    } else {
      pass(`MCP anchor_hash → ${anchored.hash.slice(0, 14)}…`);
    }

    const verifyResult = await client.callTool({
      name: "verify_hash",
      arguments: {
        payload,
        codecId: "raw",
        algo: 1,
        encoding: "utf8",
        claimedHash: anchored.hash,
      },
    });
    const verified = parseToolJson(verifyResult) as {
      verified: boolean;
      reason: string | null;
    };
    if (verified.verified !== true) {
      fail("MCP verify_hash after anchor", verified);
    } else {
      pass("MCP verify_hash → verified:true");
    }

    const adversarial = await client.callTool({
      name: "verify_hash",
      arguments: {
        payload: "forged-payload",
        codecId: "raw",
        algo: 1,
        encoding: "utf8",
        claimedHash: anchored.hash,
      },
    });
    const forged = parseToolJson(adversarial) as {
      verified: boolean;
      reason: string | null;
    };
    if (forged.verified !== false || forged.reason !== "HASH_MISMATCH") {
      fail("MCP adversarial verify should be HASH_MISMATCH", forged);
    } else {
      pass("MCP adversarial verify → HASH_MISMATCH");
    }

    const neverAnchored = await client.callTool({
      name: "verify_hash",
      arguments: {
        payload: `ghost-${Date.now()}`,
        codecId: "raw",
        algo: 1,
        encoding: "utf8",
      },
    });
    const ghost = parseToolJson(neverAnchored) as {
      verified: boolean;
      reason: string | null;
    };
    if (ghost.verified !== false || ghost.reason !== "NOT_FOUND") {
      fail("MCP never-anchored should be NOT_FOUND", ghost);
    } else {
      pass("MCP never-anchored → NOT_FOUND");
    }
  } finally {
    await client.close();
  }

  console.log(
    process.exitCode === 1
      ? "\nMCP smoke FAILED — see errors above."
      : "\nMCP smoke PASSED — stdio server + tool protocol work.",
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

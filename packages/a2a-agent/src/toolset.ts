import type { Config, RegistryClient, VerificationResult } from "@onchain-agent/anchor-client";
import type { Hex32 } from "@onchain-agent/hash-core";
import { MCPClient } from "@mastra/mcp";
import { createTools } from "@onchain-agent/mcp-server";
import { findRepoRoot } from "@onchain-agent/anchor-client";
import { join } from "node:path";
import type { PayloadEncoding } from "@onchain-agent/anchor-client";
import type { CodecId } from "@onchain-agent/hash-core";
import type { AnchorPayloadInput, AnchorPayloadOutput } from "./schemas.js";

interface RunnableTool {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  execute?: (ctx: any) => Promise<any>;
  inputSchema?: { parse: (v: unknown) => unknown };
}

async function runTool(tool: RunnableTool, args: unknown): Promise<unknown> {
  if (!tool.execute) throw new Error("tool has no execute fn");
  const parsed = tool.inputSchema ? tool.inputSchema.parse(args) : args;
  return tool.execute({ context: parsed });
}

export interface AnchorHashInput {
  codecId: CodecId;
  algo: number;
  encoding?: PayloadEncoding;
  payload?: string | Record<string, unknown> | unknown[];
  leaves?: string[];
  salt?: Hex32;
  metadataHash?: Hex32;
}

export interface VerifyHashInput {
  payload: string | Record<string, unknown> | unknown[];
  codecId: CodecId;
  algo: number;
  encoding?: PayloadEncoding;
  salt?: Hex32;
  claimedHash?: Hex32;
}

export interface GetAnchorInput {
  hash: Hex32;
  crossCheckLogs?: boolean;
}

export interface VerifyByTxInput {
  txHash: Hex32;
  expectedHash?: Hex32;
}

export interface VerifyMerkleProofInput {
  root: Hex32;
  proof: Hex32[];
  leaf?: Hex32;
  leafPayload?: string;
  encoding?: PayloadEncoding;
}

export interface VerifyByLogInput {
  hash: Hex32;
}

/** Typed facade over Phase D MCP anchor/verify tools. */
export interface AnchorToolset {
  anchorHash(input: AnchorHashInput): Promise<AnchorPayloadOutput>;
  verifyHash(input: VerifyHashInput): Promise<VerificationResult>;
  getAnchor(input: GetAnchorInput): Promise<VerificationResult & {
    algo: number | null;
    isMerkleRoot: boolean | null;
    metadataHash: Hex32 | null;
  }>;
  verifyMerkleProof(input: VerifyMerkleProofInput): Promise<VerificationResult>;
  verifyByTx(input: VerifyByTxInput): Promise<VerificationResult>;
  verifyByLog(input: VerifyByLogInput): Promise<VerificationResult>;
  disconnect?(): Promise<void>;
}

function wrapTools(tools: ReturnType<typeof createTools>): AnchorToolset {
  return {
    anchorHash: (input) => runTool(tools.anchor_hash, input) as Promise<AnchorPayloadOutput>,
    verifyHash: (input) => runTool(tools.verify_hash, input) as Promise<VerificationResult>,
    getAnchor: (input) =>
      runTool(tools.get_anchor, input) as Promise<
        VerificationResult & {
          algo: number | null;
          isMerkleRoot: boolean | null;
          metadataHash: Hex32 | null;
        }
      >,
    verifyMerkleProof: (input) =>
      runTool(tools.verify_merkle_proof, input) as Promise<VerificationResult>,
    verifyByTx: (input) => runTool(tools.verify_by_tx, input) as Promise<VerificationResult>,
    verifyByLog: (input) => runTool(tools.verify_by_log, input) as Promise<VerificationResult>,
  };
}

/** In-process adapter: calls `createTools()` directly (tests / e2e). */
export function fromCreateTools(client: RegistryClient, config: Config): AnchorToolset {
  return wrapTools(createTools(client, config));
}

export interface McpToolsetOptions {
  command: string;
  args: string[];
  cwd?: string;
  env?: Record<string, string>;
}

const MCP_TOOL_MAP = {
  anchorHash: "anchor_hash",
  verifyHash: "verify_hash",
  getAnchor: "get_anchor",
  verifyMerkleProof: "verify_merkle_proof",
  verifyByTx: "verify_by_tx",
  verifyByLog: "verify_by_log",
} as const;

function pickMcpTool(
  tools: Record<string, RunnableTool>,
  logicalName: keyof typeof MCP_TOOL_MAP,
): RunnableTool {
  const bare = MCP_TOOL_MAP[logicalName];
  if (tools[bare]) return tools[bare]!;

  const suffix = `_${bare}`;
  const match = Object.entries(tools).find(([name]) => name.endsWith(suffix));
  if (match) return match[1]!;

  throw new Error(`MCP tool not found for ${logicalName} (expected ${bare})`);
}

/** Prod adapter: spawns the Phase D stdio MCP server via Mastra MCPClient. */
export async function fromMcpClient(options: McpToolsetOptions): Promise<AnchorToolset> {
  const repoRoot = options.cwd ?? findRepoRoot(import.meta.url);
  const args = options.args.map((arg) =>
    arg.includes("mcp-server") ? join(repoRoot, arg) : arg,
  );

  const client = new MCPClient({
    id: "onchain-anchor",
    servers: {
      anchor: {
        command: options.command,
        args,
        env: { ...process.env, ...options.env } as Record<string, string>,
      },
    },
  });

  const tools = (await client.getTools()) as Record<string, RunnableTool>;

  return {
    anchorHash: (input) =>
      runTool(pickMcpTool(tools, "anchorHash"), input) as Promise<AnchorPayloadOutput>,
    verifyHash: (input) =>
      runTool(pickMcpTool(tools, "verifyHash"), input) as Promise<VerificationResult>,
    getAnchor: (input) =>
      runTool(pickMcpTool(tools, "getAnchor"), input) as Promise<
        VerificationResult & {
          algo: number | null;
          isMerkleRoot: boolean | null;
          metadataHash: Hex32 | null;
        }
      >,
    verifyMerkleProof: (input) =>
      runTool(pickMcpTool(tools, "verifyMerkleProof"), input) as Promise<VerificationResult>,
    verifyByTx: (input) =>
      runTool(pickMcpTool(tools, "verifyByTx"), input) as Promise<VerificationResult>,
    verifyByLog: (input) =>
      runTool(pickMcpTool(tools, "verifyByLog"), input) as Promise<VerificationResult>,
    disconnect: () => client.disconnect(),
  };
}

/** Map anchor-payload skill input to toolset anchorHash input. */
export function toAnchorHashInput(input: AnchorPayloadInput): AnchorHashInput {
  return {
    codecId: input.codecId,
    algo: input.algo,
    encoding: input.encoding,
    payload: input.payload,
    leaves: input.leaves,
    salt: input.salt as Hex32 | undefined,
    metadataHash: input.metadataHash as Hex32 | undefined,
  };
}

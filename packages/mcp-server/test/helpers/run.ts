import type { Config } from "@onchain-agent/anchor-client";

/** A test Config with a low confirmation depth by default. */
export function testConfig(over?: Partial<Config>): Config {
  return {
    rpcUrl: "http://127.0.0.1:8545",
    chainId: 80002,
    registryAddress: "0x0000000000000000000000000000000000000abc",
    confirmations: 1,
    ...over,
  };
}

interface RunnableTool {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  execute?: (ctx: any) => Promise<any>;
  inputSchema?: { parse: (v: unknown) => unknown };
}

/**
 * Invoke a Mastra tool's `execute` with raw args. Parses through the tool's
 * `inputSchema` first so zod defaults/validation apply exactly as the MCP
 * framework would, then passes the parsed value as `context`.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function runTool(tool: RunnableTool, args: unknown): Promise<any> {
  if (!tool.execute) throw new Error("tool has no execute fn");
  const parsed = tool.inputSchema ? tool.inputSchema.parse(args) : args;
  return tool.execute({ context: parsed });
}

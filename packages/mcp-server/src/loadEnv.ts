import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

/** Resolve `packages/mcp-server` by walking up from a module file. */
export function findMcpServerRoot(fromModuleUrl: string): string {
  let dir = dirname(fileURLToPath(fromModuleUrl));
  for (let i = 0; i < 6; i++) {
    const pkgPath = join(dir, "package.json");
    if (existsSync(pkgPath)) {
      const pkg = JSON.parse(readFileSync(pkgPath, "utf8")) as { name?: string };
      if (pkg.name === "@onchain-agent/mcp-server") return dir;
    }
    dir = join(dir, "..");
  }
  throw new Error("could not locate @onchain-agent/mcp-server package root");
}

/** Repo root: `packages/mcp-server` → `packages` → repo. */
export function findRepoRoot(mcpServerRoot: string): string {
  return join(mcpServerRoot, "..", "..");
}

/**
 * Load local env files before reading config. Precedence (later files do not
 * override keys already set — Node `loadEnvFile` behavior):
 *
 * 1. Repo root `.env.local`  (your main file at onchain-agent/.env.local)
 * 2. Package `.env.local`    (optional per-package overrides)
 *
 * MCP hosts that inject env vars directly skip this; existing `process.env`
 * values are never overwritten.
 */
export function loadLocalEnv(fromModuleUrl: string): void {
  const pkgRoot = findMcpServerRoot(fromModuleUrl);
  const repoRoot = findRepoRoot(pkgRoot);

  const candidates = [
    join(repoRoot, ".env.local"),
    join(pkgRoot, ".env.local"),
  ];

  for (const path of candidates) {
    if (existsSync(path)) process.loadEnvFile(path);
  }
}

import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

/** Walk up from a module file to the monorepo root (pnpm-workspace.yaml). */
export function findRepoRoot(fromModuleUrl: string): string {
  let dir = dirname(fileURLToPath(fromModuleUrl));
  for (let i = 0; i < 8; i++) {
    if (existsSync(join(dir, "pnpm-workspace.yaml"))) return dir;
    dir = join(dir, "..");
  }
  throw new Error("could not locate repo root (pnpm-workspace.yaml)");
}

/**
 * Load local env files before reading config. Precedence:
 *
 * 1. Repo root `.env.local`
 * 2. Package `.env.local` (optional per-package overrides)
 *
 * Existing `process.env` values are never overwritten.
 */
export function loadLocalEnv(fromModuleUrl: string, packageRoot?: string): void {
  const repoRoot = findRepoRoot(fromModuleUrl);
  const candidates = [join(repoRoot, ".env.local")];
  if (packageRoot) {
    candidates.push(join(packageRoot, ".env.local"));
  }

  for (const path of candidates) {
    if (existsSync(path)) process.loadEnvFile(path);
  }
}

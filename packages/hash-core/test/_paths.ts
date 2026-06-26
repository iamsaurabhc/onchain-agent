import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
/** Repo root: packages/hash-core/test → ../../.. */
export const REPO_ROOT = join(here, "..", "..", "..");
export const FIXTURES = join(REPO_ROOT, "fixtures");

/**
 * Generates Phase B shared goldens (§6, §7):
 *   fixtures/anchor_requests/<case>.json — one anchor request + its deterministic
 *     expected on-chain record/event:
 *       { name, hash, algo, metadataHash, isMerkleRoot,
 *         anchorer, blockTimestamp, blockNumber }
 *   fixtures/anchor_requests/manifest.json — { count, cases: [...] } that drives
 *     the Solidity unit test loop (no .sol edits to add a case).
 *
 * Hashes are reused from the Phase A goldens (fixtures/expected/*.json and
 * fixtures/merkle/batch1.json) so anchor goldens line up with real payloads.
 * The block.* values are runtime on-chain; the unit test pins them via
 * vm.warp/vm.roll and the anchorer via vm.prank to the values declared here,
 * so each golden record is fully checkable.
 *
 * Determinism: every field below is fixed (no CSPRNG, no clock) so regenerating
 * the goldens is reproducible.
 */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { AlgoTag, keccak256, utf8 } from "../src/index.js";
import type { AlgoTag as AlgoTagT, Hex32 } from "../src/index.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = join(__dirname, "..", "..", "..");
const FIX = join(REPO_ROOT, "fixtures");
const EXPECTED = join(FIX, "expected");
const MERKLE = join(FIX, "merkle");
const ANCHOR_REQUESTS = join(FIX, "anchor_requests");

mkdirSync(ANCHOR_REQUESTS, { recursive: true });

const ZERO32 = ("0x" + "0".repeat(64)) as Hex32;

/** Read a golden hash produced by Phase A (fixtures/expected/<payload>.json). */
function expectedHash(payload: string): Hex32 {
  const json = JSON.parse(readFileSync(join(EXPECTED, payload + ".json"), "utf8"));
  return json.hash as Hex32;
}

/** Read the Phase A Merkle root (fixtures/merkle/batch1.json). */
function merkleRoot(): Hex32 {
  const json = JSON.parse(readFileSync(join(MERKLE, "batch1.json"), "utf8"));
  return json.root as Hex32;
}

interface AnchorCase {
  name: string;
  hash: Hex32;
  algo: AlgoTagT;
  metadataHash: Hex32;
  isMerkleRoot: boolean;
  anchorer: Hex32;
  blockTimestamp: number;
  blockNumber: number;
}

const ANCHORER_A = "0x00000000000000000000000000000000000000A1" as Hex32;
const ANCHORER_B = "0x00000000000000000000000000000000000000B2" as Hex32;

const cases: AnchorCase[] = [
  {
    name: "doc_keccak",
    hash: expectedHash("doc.txt"),
    algo: AlgoTag.KECCAK256,
    metadataHash: ZERO32,
    isMerkleRoot: false,
    anchorer: ANCHORER_A,
    blockTimestamp: 1_750_000_000,
    blockNumber: 1_000_000,
  },
  {
    name: "api_sha256_with_metadata",
    hash: expectedHash("api_response.json"),
    algo: AlgoTag.SHA256,
    metadataHash: keccak256(utf8("content-type:application/json")),
    isMerkleRoot: false,
    anchorer: ANCHORER_A,
    blockTimestamp: 1_750_000_100,
    blockNumber: 1_000_010,
  },
  {
    name: "dataset_salted",
    hash: expectedHash("dataset.bin"),
    algo: AlgoTag.KECCAK256_SALTED,
    metadataHash: ZERO32,
    isMerkleRoot: false,
    anchorer: ANCHORER_B,
    blockTimestamp: 1_750_000_200,
    blockNumber: 1_000_020,
  },
  {
    name: "batch_merkle_root",
    hash: merkleRoot(),
    algo: AlgoTag.MERKLE_KECCAK256,
    metadataHash: keccak256(utf8("codec:log-batch")),
    isMerkleRoot: true,
    anchorer: ANCHORER_B,
    blockTimestamp: 1_750_000_300,
    blockNumber: 1_000_030,
  },
];

interface ManifestEntry {
  name: string;
  algo: number;
  isMerkleRoot: boolean;
}
const manifest: { count: number; cases: ManifestEntry[] } = { count: 0, cases: [] };

for (const c of cases) {
  writeFileSync(join(ANCHOR_REQUESTS, c.name + ".json"), JSON.stringify(c, null, 2) + "\n");
  manifest.cases.push({ name: c.name, algo: c.algo, isMerkleRoot: c.isMerkleRoot });
}

manifest.count = manifest.cases.length;
writeFileSync(join(ANCHOR_REQUESTS, "manifest.json"), JSON.stringify(manifest, null, 2) + "\n");

console.log(`Wrote ${cases.length} anchor_requests + manifest.`);

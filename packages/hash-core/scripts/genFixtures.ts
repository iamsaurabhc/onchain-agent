/**
 * Generates the shared, cross-language golden fixtures (§7):
 *   fixtures/payloads/*      — one representative input per taxonomy category
 *   fixtures/expected/*.json — { codecId, algo, salt?, hash } per payload
 *   fixtures/merkle/batch1.json — { leaves[], root, proofs: { leaf: proof[] } }
 *   fixtures/manifest.json   — drives the Solidity parity tests (no .sol edits
 *                              needed to add a payload)
 *
 * Determinism: JCS payloads are written to disk already canonicalized so the
 * raw bytes Solidity reads equal the canonical bytes TS hashes. Salts are fixed
 * (not CSPRNG) here purely so regenerating the goldens is reproducible.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  AlgoTag,
  CodecId,
  hashPayload,
  merkle,
  normalizeJcs,
  utf8,
  fromHex,
} from "../src/index.js";
import type { AlgoTag as AlgoTagT, CodecId as CodecIdT, Hex32 } from "../src/index.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = join(__dirname, "..", "..", "..");
const FIX = join(REPO_ROOT, "fixtures");
const PAYLOADS = join(FIX, "payloads");
const EXPECTED = join(FIX, "expected");
const MERKLE = join(FIX, "merkle");

for (const d of [PAYLOADS, EXPECTED, MERKLE]) mkdirSync(d, { recursive: true });

/** Deterministic pseudo-binary bytes for the "binary" fixtures. */
function pseudoBytes(seed: number, len: number): Uint8Array {
  const out = new Uint8Array(len);
  let x = seed >>> 0;
  for (let i = 0; i < len; i++) {
    // xorshift32
    x ^= x << 13;
    x ^= x >>> 17;
    x ^= x << 5;
    x >>>= 0;
    out[i] = x & 0xff;
  }
  return out;
}

// Fixed salts (hex) for reproducible salted goldens.
const SALT_A = fromHex("0x" + "a1".repeat(32));
const SALT_B = fromHex("0x" + "b2".repeat(32));

interface Spec {
  name: string;
  codecId: CodecIdT;
  algo: AlgoTagT;
  /** raw bytes payload, OR a JSON value for jcs (we write canonical bytes). */
  bytes?: Uint8Array;
  json?: unknown;
  salt?: Uint8Array;
}

const specs: Spec[] = [
  {
    name: "doc.txt",
    codecId: CodecId.RAW,
    algo: AlgoTag.KECCAK256,
    bytes: utf8(
      "MASTER SERVICES AGREEMENT\n\nThis agreement is entered into between the parties as of 2026-01-01.\nAll terms are final and binding.\n",
    ),
  },
  {
    name: "credential.json",
    codecId: CodecId.JCS,
    algo: AlgoTag.KECCAK256,
    json: {
      "@context": ["https://www.w3.org/2018/credentials/v1"],
      type: ["VerifiableCredential", "UniversityDegreeCredential"],
      issuer: "did:example:university",
      issuanceDate: "2026-01-15T00:00:00Z",
      credentialSubject: {
        id: "did:example:student-42",
        degree: { type: "BachelorDegree", name: "B.Sc. Computer Science" },
      },
    },
  },
  {
    name: "api_response.json",
    codecId: CodecId.JCS,
    algo: AlgoTag.SHA256,
    json: {
      status: "ok",
      data: { items: [3, 1, 2], page: 1, total: 3 },
      meta: { generatedAt: "2026-06-26T00:00:00Z", version: "1.4.0" },
    },
  },
  {
    name: "image.bin",
    codecId: CodecId.RAW,
    algo: AlgoTag.SHA256,
    bytes: pseudoBytes(0xc0ffee, 1024),
  },
  {
    name: "dataset.bin",
    codecId: CodecId.RAW,
    algo: AlgoTag.KECCAK256_SALTED,
    bytes: pseudoBytes(0xda7a5e7, 2048),
    salt: SALT_A,
  },
  {
    name: "log_batch.jsonl",
    codecId: CodecId.RAW,
    algo: AlgoTag.SHA256_SALTED,
    bytes: utf8(
      [
        '{"ts":"2026-06-26T00:00:01Z","actor":"agent","action":"propose","ok":true}',
        '{"ts":"2026-06-26T00:00:02Z","actor":"policy","action":"allow","ok":true}',
        '{"ts":"2026-06-26T00:00:03Z","actor":"agent","action":"execute","ok":true}',
        '{"ts":"2026-06-26T00:00:04Z","actor":"agent","action":"anchor","ok":true}',
      ].join("\n") + "\n",
    ),
    salt: SALT_B,
  },
];

interface ManifestEntry {
  name: string;
  codecId: CodecIdT;
  algo: number;
  salted: boolean;
}
const manifest: { count: number; payloads: ManifestEntry[]; merkle: string } = {
  count: 0,
  payloads: [],
  merkle: "merkle/batch1.json",
};

for (const spec of specs) {
  // Resolve the bytes that land on disk (canonical for JCS).
  const diskBytes =
    spec.codecId === CodecId.JCS ? normalizeJcs(spec.json) : (spec.bytes as Uint8Array);
  writeFileSync(join(PAYLOADS, spec.name), Buffer.from(diskBytes));

  // For JCS, hashPayload re-canonicalizes the same value → identical bytes.
  const payloadArg = spec.codecId === CodecId.JCS ? spec.json : diskBytes;
  const result = hashPayload(payloadArg, {
    codecId: spec.codecId,
    algo: spec.algo,
    salt: spec.salt,
  });

  const expected: Record<string, unknown> = {
    codecId: result.codecId,
    algo: result.algo,
    hash: result.hash,
  };
  if (result.salt) expected.salt = result.salt;
  writeFileSync(
    join(EXPECTED, spec.name + ".json"),
    JSON.stringify(expected, null, 2) + "\n",
  );

  manifest.payloads.push({
    name: spec.name,
    codecId: result.codecId,
    algo: result.algo,
    salted: result.salt !== undefined,
  });
}

// ---- Merkle golden trees (§6 Phase C) ----
// One source of truth for the TS golden tests and the Solidity parity / unit
// suites. Every tree is deterministic so regenerating goldens is reproducible.

interface MerkleTreeFixture {
  algo: number;
  leaves: Hex32[];
  root: Hex32;
  proofs: Record<string, Hex32[]>;
  proofArrays: Hex32[][];
  /** Leaf hashes provably absent from the tree (negative goldens). */
  nonMembers: Hex32[];
}

/** Build a full tree fixture from raw leaf inputs (each hashed to a leaf). */
function buildTreeFixture(leafInputs: Uint8Array[]): MerkleTreeFixture {
  const leaves = leafInputs.map((b) => merkle.leafHash(b));
  const root = merkle.buildRoot(leaves);
  const proofs: Record<string, Hex32[]> = {};
  const proofArrays: Hex32[][] = [];
  for (const leaf of leaves) {
    const proof = merkle.getProof(leaves, leaf);
    proofs[leaf] = proof;
    proofArrays.push(proof);
  }
  const leafSet = new Set<string>(leaves);
  const nonMembers: Hex32[] = [];
  for (let i = 0; nonMembers.length < 3; i++) {
    const cand = merkle.leafHash(utf8(`non-member-${i}`));
    if (!leafSet.has(cand)) nonMembers.push(cand);
  }
  return { algo: AlgoTag.MERKLE_KECCAK256, leaves, root, proofs, proofArrays, nonMembers };
}

function writeTree(file: string, fixture: MerkleTreeFixture): void {
  writeFileSync(join(MERKLE, file), JSON.stringify(fixture, null, 2) + "\n");
}

// batch1: the original 5 log-line batch. Its root MUST stay stable — the Phase B
// anchor goldens (genAnchorFixtures.ts) bind to it.
const batch1Lines = [
  '{"ts":"2026-06-26T00:00:01Z","actor":"agent","action":"propose","ok":true}',
  '{"ts":"2026-06-26T00:00:02Z","actor":"policy","action":"allow","ok":true}',
  '{"ts":"2026-06-26T00:00:03Z","actor":"agent","action":"execute","ok":true}',
  '{"ts":"2026-06-26T00:00:04Z","actor":"agent","action":"anchor","ok":true}',
  '{"ts":"2026-06-26T00:00:05Z","actor":"agent","action":"verify","ok":true}',
];
const batch1 = buildTreeFixture(batch1Lines.map((l) => utf8(l)));
writeTree("batch1.json", batch1);

interface TreeManifestEntry {
  file: string;
  size: number;
}
const merkleManifest: { count: number; trees: TreeManifestEntry[] } = {
  count: 0,
  trees: [{ file: "batch1.json", size: batch1.leaves.length }],
};

// Varied sizes incl. edge cases: size 1 (empty proof, root == leaf), odd (3),
// powers of two (2, 8, 16), and a larger tree (64) for breadth.
for (const size of [1, 2, 3, 8, 16, 64]) {
  const inputs: Uint8Array[] = [];
  for (let i = 0; i < size; i++) inputs.push(utf8(`tree-${size}-leaf-${i}`));
  const file = `tree_${size}.json`;
  writeTree(file, buildTreeFixture(inputs));
  merkleManifest.trees.push({ file, size });
}

merkleManifest.count = merkleManifest.trees.length;
writeFileSync(join(MERKLE, "manifest.json"), JSON.stringify(merkleManifest, null, 2) + "\n");

manifest.count = manifest.payloads.length;
writeFileSync(join(FIX, "manifest.json"), JSON.stringify(manifest, null, 2) + "\n");

console.log(
  `Wrote ${specs.length} payloads + expected, ${merkleManifest.count} merkle trees, manifest.`,
);
console.log(`batch1 root: ${batch1.root}`);

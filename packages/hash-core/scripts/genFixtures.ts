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
import type { AlgoTag as AlgoTagT, CodecId as CodecIdT } from "../src/index.js";

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

// ---- Merkle batch: leaves = keccak256(each log line) ----
const logLines = utf8(
  [
    '{"ts":"2026-06-26T00:00:01Z","actor":"agent","action":"propose","ok":true}',
    '{"ts":"2026-06-26T00:00:02Z","actor":"policy","action":"allow","ok":true}',
    '{"ts":"2026-06-26T00:00:03Z","actor":"agent","action":"execute","ok":true}',
    '{"ts":"2026-06-26T00:00:04Z","actor":"agent","action":"anchor","ok":true}',
    '{"ts":"2026-06-26T00:00:05Z","actor":"agent","action":"verify","ok":true}',
  ].join("\n"),
);
const lineStrings = new TextDecoder().decode(logLines).split("\n");
const leaves = lineStrings.map((line) => merkle.leafHash(utf8(line)));
const root = merkle.buildRoot(leaves);
const proofs: Record<string, string[]> = {};
const proofArrays: string[][] = [];
for (const leaf of leaves) {
  proofs[leaf] = merkle.getProof(leaves, leaf);
  proofArrays.push(proofs[leaf]);
}

writeFileSync(
  join(MERKLE, "batch1.json"),
  JSON.stringify(
    { algo: AlgoTag.MERKLE_KECCAK256, leaves, root, proofs, proofArrays },
    null,
    2,
  ) + "\n",
);

manifest.count = manifest.payloads.length;
writeFileSync(join(FIX, "manifest.json"), JSON.stringify(manifest, null, 2) + "\n");

console.log(`Wrote ${specs.length} payloads + expected, merkle batch (${leaves.length} leaves), manifest.`);
console.log(`Merkle root: ${root}`);

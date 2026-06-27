import type { Address } from "viem";

/** Default target chain: Polygon Amoy testnet (docs/PHASE_ANCHOR_VERIFY.md §4.4). */
export const DEFAULT_CHAIN_ID = 80002;

/** Default confirmation depth before `verified: true` (§5.6). */
export const DEFAULT_CONFIRMATIONS = 64;

/**
 * Default per-request `eth_getLogs` block-range window. Many providers cap this;
 * Alchemy's free tier allows only 10 blocks, so the scan is chunked to stay
 * within whatever limit is configured.
 */
export const DEFAULT_LOG_SCAN_MAX_RANGE = 500;

/**
 * Default total look-back window (blocks from head) for an event-log scan.
 * `0` means "scan back to genesis" (chunked, with early exit on first match).
 */
export const DEFAULT_LOG_SCAN_LOOKBACK = 0;

/** Runtime configuration resolved from the environment. */
export interface Config {
  rpcUrl: string;
  chainId: number;
  registryAddress: Address;
  /** Anchorer signing key; required only for the write path (`anchor_hash`). */
  anchorerPrivateKey?: `0x${string}`;
  /** Minimum confirmations before a record is considered final. */
  confirmations: number;
  /** Max blocks per `eth_getLogs` request (provider range cap). */
  logScanMaxRange?: number;
  /** Total blocks back from head to scan for logs; 0 = to genesis. */
  logScanLookback?: number;
}

function requireEnv(env: NodeJS.ProcessEnv, key: string): string {
  const value = env[key];
  if (value === undefined || value === "") {
    throw new Error(`missing required env var: ${key}`);
  }
  return value;
}

function asAddress(value: string, key: string): Address {
  if (!/^0x[0-9a-fA-F]{40}$/.test(value)) {
    throw new Error(`${key} is not a 20-byte 0x address: ${value}`);
  }
  return value as Address;
}

function asPrivateKey(value: string, key: string): `0x${string}` {
  if (!/^0x[0-9a-fA-F]{64}$/.test(value)) {
    throw new Error(`${key} is not a 32-byte 0x private key`);
  }
  return value as `0x${string}`;
}

/**
 * Load and validate config from `env` (defaults to `process.env`).
 *
 * `CHAIN_ID` defaults to Amoy (80002) and is validated as an integer; callers
 * that point at another network must set it explicitly, which guards against
 * accidentally verifying against the wrong chain (§5.6).
 */
export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const rpcUrl = requireEnv(env, "RPC_URL");
  const registryAddress = asAddress(
    requireEnv(env, "ANCHOR_REGISTRY_ADDRESS"),
    "ANCHOR_REGISTRY_ADDRESS",
  );

  const chainId = env.CHAIN_ID ? Number(env.CHAIN_ID) : DEFAULT_CHAIN_ID;
  if (!Number.isInteger(chainId) || chainId <= 0) {
    throw new Error(`CHAIN_ID must be a positive integer, got: ${env.CHAIN_ID}`);
  }

  const confirmations = env.CONFIRMATIONS
    ? Number(env.CONFIRMATIONS)
    : DEFAULT_CONFIRMATIONS;
  if (!Number.isInteger(confirmations) || confirmations < 0) {
    throw new Error(
      `CONFIRMATIONS must be a non-negative integer, got: ${env.CONFIRMATIONS}`,
    );
  }

  const rawKey = env.ANCHORER_PRIVATE_KEY;
  const anchorerPrivateKey = rawKey
    ? asPrivateKey(rawKey, "ANCHORER_PRIVATE_KEY")
    : undefined;

  const logScanMaxRange = env.LOG_SCAN_MAX_RANGE
    ? Number(env.LOG_SCAN_MAX_RANGE)
    : DEFAULT_LOG_SCAN_MAX_RANGE;
  if (!Number.isInteger(logScanMaxRange) || logScanMaxRange <= 0) {
    throw new Error(
      `LOG_SCAN_MAX_RANGE must be a positive integer, got: ${env.LOG_SCAN_MAX_RANGE}`,
    );
  }

  const logScanLookback = env.LOG_SCAN_LOOKBACK
    ? Number(env.LOG_SCAN_LOOKBACK)
    : DEFAULT_LOG_SCAN_LOOKBACK;
  if (!Number.isInteger(logScanLookback) || logScanLookback < 0) {
    throw new Error(
      `LOG_SCAN_LOOKBACK must be a non-negative integer, got: ${env.LOG_SCAN_LOOKBACK}`,
    );
  }

  return {
    rpcUrl,
    chainId,
    registryAddress,
    anchorerPrivateKey,
    confirmations,
    logScanMaxRange,
    logScanLookback,
  };
}

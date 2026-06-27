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

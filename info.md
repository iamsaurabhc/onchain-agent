# SafeAgentExec — Technical Design Draft (v0.1)

> Working name: **SafeAgentExec**. Rename freely before publishing (e.g. to match your GitHub namespace, `io.github.<you>/safeagentexec`).
>
> Purpose: an open-source, invariant-tested execution layer that lets autonomous AI agents (via MCP and A2A) safely propose and execute blockchain transactions, with on-chain enforced spend caps, allowlisting, and circuit breakers — so other developers fork a safety baseline instead of rebuilding one.

---

## 1. Repository Structure (monorepo, three packages + examples)

```
safeagentexec/
├── contracts/                  # Package 1: Solidity core (Foundry)
│   ├── src/
│   ├── test/
│   ├── script/
│   └── foundry.toml
├── mcp-server/                 # Package 2: MCP tool server
│   ├── src/
│   ├── server.json
│   └── package.json
├── a2a-agent/                  # Package 3: A2A reference agent (ADK)
│   ├── agent_card.json
│   ├── skills/
│   └── main.py
├── dashboard/                  # Optional extension, decoupled
│   └── (read-only viewer, separate repo or subfolder)
├── examples/                   # Forkable vertical templates
│   ├── defi-yield-agent/
│   ├── treasury-agent/
│   └── nft-mint-agent/
└── docs/
    ├── ARCHITECTURE.md
    ├── SECURITY.md
    └── THREAT_MODEL.md
```

Each top-level package is independently installable. The contracts package has zero dependency on the other two — this is the trust boundary, and it should be usable by someone who never touches your MCP or agent code.

---

## 2. Solidity Contracts — Core Package

### 2.1 `PolicyRegistry.sol`
Owns the rules. No execution logic lives here — only state and validation.

```solidity
interface IPolicyRegistry {
    function isAllowlisted(address target) external view returns (bool);
    function perTxCap(address agent) external view returns (uint256);
    function dailyCap(address agent) external view returns (uint256);
    function spentToday(address agent) external view returns (uint256);
    function recordSpend(address agent, uint256 amount) external; // executor-only
    function addToAllowlist(address target) external;              // admin-only
    function removeFromAllowlist(address target) external;         // admin-only
    function setCaps(address agent, uint256 perTx, uint256 daily) external; // admin-only
}
```

State to track:
- `mapping(address => bool) allowlist`
- `mapping(address => uint256) perTxCapOf`
- `mapping(address => uint256) dailyCapOf`
- `mapping(address => uint256) spentTodayOf`
- `mapping(address => uint256) lastResetDayOf` (rolling 24h window logic)

### 2.2 `AgentExecutor.sol`
The only contract the agent actually calls. Validates against `PolicyRegistry`, then executes. This is the contract that should be near-impossible to bypass.

```solidity
interface IAgentExecutor {
    function execute(
        address target,
        uint256 value,
        bytes calldata data
    ) external returns (bytes memory);

    function simulate(
        address target,
        uint256 value,
        bytes calldata data
    ) external returns (bool success, bytes memory result); // staticcall-based dry run
}
```

Execution flow inside `execute()`:
1. `require(!paused)`
2. `require(policyRegistry.isAllowlisted(target))`
3. `require(value <= policyRegistry.perTxCap(msg.sender))`
4. `require(policyRegistry.spentToday(msg.sender) + value <= policyRegistry.dailyCap(msg.sender))`
5. `policyRegistry.recordSpend(msg.sender, value)`
6. perform the call, capture result, emit event
7. on failure: revert the whole transaction (no partial state)

### 2.3 `CircuitBreaker.sol`
Either a standalone contract or composed via OpenZeppelin's `Pausable`. Tracks consecutive simulation/execution failures and auto-pauses.

```solidity
interface ICircuitBreaker {
    function recordFailure() external;     // called by AgentExecutor on failed execution
    function recordSuccess() external;     // resets failure streak
    function isPaused() external view returns (bool);
    function manualPause() external;       // guardian-only, instant
    function manualUnpause() external;     // admin-only, requires cooldown elapsed
}
```

Trigger logic: N consecutive failures within a rolling window → auto-pause. Manual pause is instant for the guardian role; unpause has a mandatory cooldown to prevent immediate re-trigger by a still-compromised agent key.

### 2.4 `AgentRegistry.sol` (multi-agent / multi-tenant support)
If you want one deployment to serve multiple agents/orgs (likely, given the "forkable by others" goal):

```solidity
interface IAgentRegistry {
    function registerAgent(address agentSigner, address ownerAdmin) external;
    function revokeAgent(address agentSigner) external;
    function isActiveAgent(address agentSigner) external view returns (bool);
}
```

This lets `PolicyRegistry` and `AgentExecutor` key everything off a registered agent identity rather than assuming a single global agent.

### 2.5 `Roles.sol` / Access Control
Use OpenZeppelin `AccessControl`, not a custom implementation. Define roles:
- `ADMIN_ROLE` — sets policy, caps, allowlist
- `AGENT_ROLE` — the signer(s) permitted to call `execute()`
- `GUARDIAN_ROLE` — can `manualPause()` instantly, cannot unpause alone

### 2.6 Interfaces folder
`IPolicyRegistry.sol`, `IAgentExecutor.sol`, `ICircuitBreaker.sol`, `IAgentRegistry.sol` — kept separate from implementations so MCP/agent-layer integrators and auditors can reason about the contract surface without reading implementation logic.

### 2.7 Optional extension contracts (ship as separate, clearly-labeled "extensions/" folder, not core)
- `TimelockPolicy.sol` — delay before a new allowlist entry becomes active (defends against a compromised admin key adding a malicious target instantly)
- `MultisigGate.sol` — wraps `execute()` behind an M-of-N signer requirement for transactions above a threshold (could integrate with Gnosis Safe via interface rather than reimplementing multisig)
- `DAOAllowlist.sol` — allowlist changes go through a governance vote instead of a single admin

Keeping these as opt-in extensions (per the earlier "policy extensions" discussion) keeps the audited core small.

---

## 3. Test Suite Layout (`contracts/test/`)

```
test/
├── unit/
│   ├── PolicyRegistry.t.sol
│   ├── AgentExecutor.t.sol
│   └── CircuitBreaker.t.sol
├── fuzz/
│   ├── AgentExecutor.fuzz.t.sol      # random targets/amounts/callers
│   └── PolicyRegistry.fuzz.t.sol
├── invariant/
│   ├── SpendCapInvariant.t.sol       # "spent never exceeds dailyCap, any sequence"
│   ├── AllowlistInvariant.t.sol      # "non-allowlisted target never succeeds"
│   └── handlers/
│       └── ExecutorHandler.sol       # Foundry invariant handler/actor contract
└── integration/
    └── FullFlow.t.sol                # policy + executor + circuit breaker, end to end
```

This mirrors the test plan from the earlier phase discussion — unit → fuzz → invariant → integration, in that order of build priority.

---

## 4. MCP Server Package (`mcp-server/`)

### 4.1 Tool surface (1:1 mapping to contract functions, plus orchestration helpers)
| Tool | Maps to | Notes |
|---|---|---|
| `simulate_tx` | `AgentExecutor.simulate()` | Always called before `execute_tx`; enforced server-side, not optional |
| `execute_tx` | `AgentExecutor.execute()` | Refuses to run without a prior successful `simulate_tx` in the same request context |
| `check_policy` | `PolicyRegistry` getters | Read-only: caps, allowlist status, spent-today |
| `check_circuit_breaker` | `CircuitBreaker.isPaused()` | Read-only |
| `get_tx_history` | event log query | Read-only, for the dashboard and for agent self-awareness |
| `verify_on_explorer` | external (Polygonscan API) | Returns explorer link + verification status |

### 4.2 Files
```
mcp-server/
├── src/
│   ├── tools/
│   │   ├── simulateTx.ts
│   │   ├── executeTx.ts
│   │   ├── checkPolicy.ts
│   │   ├── checkCircuitBreaker.ts
│   │   └── getTxHistory.ts
│   ├── chain/
│   │   ├── client.ts          # viem/ethers provider setup, per-network config
│   │   └── contracts.ts       # ABIs + typed contract instances
│   └── index.ts                # MCP server entrypoint
├── server.json                 # for official MCP registry submission
└── package.json
```

`server.json` namespace target: `io.github.<you>/safeagentexec-mcp`.

---

## 5. A2A Agent Package (`a2a-agent/`)

### 5.1 Agent Card (`agent_card.json`) — skeleton
```json
{
  "name": "SafeAgentExec",
  "description": "Executes allowlisted, spend-capped on-chain transactions on behalf of requesting agents.",
  "url": "https://your-deployment/.well-known/agent-card.json",
  "version": "0.1.0",
  "capabilities": { "streaming": true, "pushNotifications": false },
  "skills": [
    {
      "id": "execute-onchain-tx",
      "description": "Simulate then execute a transaction against an allowlisted target within policy caps.",
      "inputModes": ["application/json"],
      "outputModes": ["application/json"]
    },
    {
      "id": "check-policy-status",
      "description": "Return current allowlist, caps, and spent-today for an agent identity.",
      "inputModes": ["application/json"],
      "outputModes": ["application/json"]
    }
  ]
}
```

### 5.2 Files
```
a2a-agent/
├── agent_card.json
├── skills/
│   ├── execute_onchain_tx.py
│   └── check_policy_status.py
├── main.py            # ADK app wiring skills to MCP tool calls
└── requirements.txt
```

The agent layer should contain **no policy logic of its own** — every safety decision is re-validated at the contract layer. The agent layer's job is translation (A2A task → MCP tool call → response), not enforcement.

---

## 6. Deployment Scripts (`contracts/script/`)

```
script/
├── DeployLocal.s.sol      # anvil
├── DeployAmoy.s.sol       # Polygon Amoy testnet, chain ID 80002
└── DeployMainnet.s.sol    # gated behind explicit confirmation flag, small caps by default
```

Mainnet script should default to conservative caps and require an explicit `--confirm-mainnet` flag to discourage accidental real-fund deployment during testing.

---

## 7. Core Shipping Packages — Summary

| Package | Ships as | Audience |
|---|---|---|
| `contracts/` | Foundry-installable Solidity lib | Anyone wanting the safety primitives, regardless of agent stack |
| `mcp-server/` | npm + PyPI equivalent | Any MCP host (Claude, Cursor, custom runtimes) |
| `a2a-agent/` | Reference implementation, not a hard dependency | Anyone on A2A wanting a working example to fork |
| `dashboard/` | Separate optional repo/folder | Ops visibility, non-technical reviewers — never a dependency of the above |
| `examples/` | Forkable templates | Vertical use cases (DeFi, treasury, NFT) building on the same core |

---

## 8. Documentation to write alongside code

- `docs/ARCHITECTURE.md` — the three-layer diagram and trust boundary explanation
- `docs/THREAT_MODEL.md` — explicitly enumerate: compromised agent key, malicious calling agent, RPC/simulation divergence, admin key compromise — and the mitigation per threat
- `docs/SECURITY.md` — responsible disclosure process, audit status (be honest if unaudited — say so prominently)
- Per-package `README.md` with the `mcp-name`/namespace markers required for registry submission

---

## 9. Suggested build order (maps to earlier phase discussion)

1. `PolicyRegistry.sol` + unit/fuzz/invariant tests — get this airtight alone, no executor yet
2. `AgentExecutor.sol` wired to PolicyRegistry + integration tests
3. `CircuitBreaker.sol` + failure-injection tests
4. `AgentRegistry.sol` if multi-tenant is in scope for v0.1 (can defer to v0.2)
5. MCP server wrapping the above, with forced-simulation tests
6. A2A agent wrapping the MCP tools, with adversarial-orchestrator tests
7. Deployment scripts + Amoy end-to-end run
8. Documentation pass + registry submission

---

*This is a v0.1 draft layout — intended as a starting skeleton, not a final spec. Expect interfaces to shift once the invariant tests reveal edge cases in the cap/allowlist logic.*
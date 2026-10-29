# AgentPay Technical Architecture

Grounded in the existing repository. Maps the white paper's five layers to implemented contracts and code. Security guarantees come from AgentVault and DecisionLog, not from the LLM.

## Core Principle

AI interprets intent and proposes actions. Deterministic policy and execution systems decide what can happen and verify the outcome. The existing AgentVault enforces this boundary on-chain. DecisionLog records the decision hash before execution.

## Layers

### 1. Intent Layer
- Off-chain. Natural language is parsed in the Node.js backend (src/brain.js and related). Groq / Llama produces structured intents.
- Structured output is limited to known actions (pay, schedule, hire_agent, etc.). See frontend/src/types.ts Intent interface.
- No financial authority lives here.

### 2. Intelligence and Planning Layer
- src/solver.js decomposes goals into ordered plans using a fixed set of primitives (check_balance, wait_for_condition, pay, hire_agent).
- validatePlan() rejects unknown primitives before execution.
- Triggers (src/triggers.js) evaluate external conditions (price, GitHub, weather). These are advisory.
- Plans that include pay or hire_agent still route through AgentVault or the escrow contract. Bad plans fail safely because of the on-chain limits.

### 3. Policy and Authorization Layer
- Implemented in contracts/AgentVault.sol.
- Per-user Policy: perTxCap, dailyCap, maxTxPerHour, active flag.
- Whitelist (optional). Empty whitelist allows any recipient.
- Velocity tracking (hourlyTxCount, dailySpent) reset on time boundaries.
- Two-step agent rotation (proposeAgent / acceptAgent).
- EIP-712 executeWithSig path so a user can authorize without the operator holding a spend key.
- onlyAgent modifier on execute, multicall, and executeScheduled.
- Per-user pause (onlyOwner).
- ReentrancyGuard.
- Every payment path that moves USDC from a user balance goes through _execute, which calls _checkWhitelist and _enforcePolicy.

### 4. Execution Layer
- AgentVault.execute and executeWithSig move USDC after policy checks.
- Schedules are stored on-chain and executed only by the registered agent.
- Multicall exists for batched payments under the same requestId.
- Current settlement is direct USDC transfer on Arc. Adapters for other networks, DEXes, or bridges are not yet modular.
- Backend (src/server.js and related) calls the vault. It does not bypass it for payment paths.

### 5. Settlement and Verification Layer
- DecisionLog.sol commits keccak256 of the off-chain decision record (goal + plan + action) under the same requestId used in AgentVault before execution.
- Anyone can recompute the hash from a published record and confirm it matches the on-chain commit. Commit block number precedes the Executed event.
- finalize() records an outcome hash. This is operator-written and non-authoritative, but it sits on the same log.
- On-chain verification is limited to the USDC transfer receipt and the DecisionLog commit. Cross-network settlement and multi-stage receipts are not yet implemented.

## What Is Proven

- npm test runs against a local Hardhat EVM.
- Policy violations (non-whitelisted, per-tx cap, daily cap, hourly velocity, non-agent caller) revert and leave balances unchanged.
- DecisionLog commits cannot be forged, duplicated, or rewritten. Agent rotation is two-step.
- Solver control flow (ordering, blocking, decision-before-payment) is unit-tested with mocks.

## What Is Not Yet Implemented

- Modular adapters for swaps, bridges, or multi-network routing.
- Full payment-request lifecycle with shareable links, expiry, and structured receipts beyond the current pay path.
- DeFi protocol integrations with risk explanations.
- Public API / SDK surface for external agents beyond the existing worker and marketplace daemon.
- Verifiable inference (explicitly stubbed in src/arcAi.js).

## Next Concrete Steps

1. Keep every new payment path routing through AgentVault._execute or an equivalent on-chain policy check.
2. Add an adapter interface for execution providers so swaps and cross-network moves can be proposed without giving the planner authority.
3. Extend DecisionLog usage so every planned action (not only payments) commits before execution.
4. Document the exact requestId flow from solver to vault to log in the README.

The white paper defines the product thesis. This document maps the current security guarantees to the contracts that enforce them. New capabilities should extend the execution adapters, not move authorization off-chain.

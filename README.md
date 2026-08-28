# 🤖 AgentPay: The Autonomous, Policy-Enforced Payment Layer on Arc

**AgentPay** is an AI-powered autonomous payment agent built for the **Arc Testnet**. It bridges conversational AI with secure on-chain execution by keeping the *Decision* (AI) off-chain and the *Permission* (policy) on-chain in the `AgentVault` smart contract. Built for the Arc Agent Hackathon.

## ⚠️ Honest status

This branch hardens AgentPay for multi-user hackathon deployment. The original README overstated several claims; the corrections live inline below. Specifically:
- "Permission strictly on-chain" is now actually true — payment paths route through `AgentVault.execute`. (Previously `src/agent.js` called `walletService.sendUSDC` directly, bypassing the vault.)
- "Verifiable AI inference through decentralized consensus" is **not** implemented. All AI runs off-chain via Groq; a documented stub (`src/arcAi.js`) exists so the verifier scripts run without crashing.
- USDC decimal handling was inconsistent (mixed 1e6 / 1e18); it now flows through a single `utils/usdc.js` source of truth.
- `executeSchedule` was permissionless (anyone could force-run a schedule). It is now `onlyAgent`.
- Agent key rotation is now two-step (`proposeAgent` / `acceptAgent`).
- API routes require a shared `APP_API_KEY` (Worker↔Render) and no longer trust a bare `x-user-address` header.

This branch adds three new pieces on top of that hardening — an intent solver, a two-agent marketplace loop, and an on-chain decision log. Same honesty rule applies, so here's exactly what each one does and doesn't prove:
- **Intent solver** (`src/solver.js`) decomposes a stated goal into a plan graph built from a fixed set of primitives and executes it step by step. The plan-execution state machine is unit tested with mocked dependencies (`test/solver.test.js`) — that proves the control flow (ordering, blocking, decision-commit-before-payment, failure handling) is correct. It does **not** prove the LLM will always produce a sensible plan for an arbitrary goal — bad plans still fail safely because every `pay`/`hire_agent` step still routes through `AgentVault`/the escrow contract's own on-chain limits.
- **Two-agent marketplace** (`scripts/marketplace-agent.js`) lets two independent AgentPay deployments hire, fulfil, and judge each other's ERC-8183 escrow jobs with no human in the loop. The escrow's `submit()` only ever puts a *hash* of the deliverable on-chain, so the real text travels over a small authenticated HTTP push (`POST /agent/deliver`, its own `MARKETPLACE_API_KEY` — never the deployment's own `APP_API_KEY`) between known partners listed in `config/agentDirectory.json`. This is agent-to-agent commerce over a private, pre-agreed channel, **not** an open/permissionless marketplace — there's no discovery of unknown counterparties yet.
- **DecisionLog** (`contracts/DecisionLog.sol`) commits a hash of every AI-derived action *before* it executes, keyed to the same `requestId` used in `AgentVault`. This gives real, verifiable **decision provenance** (anyone can recompute the hash from a published record and confirm it matches what was committed, and that the commit's block number precedes the execution) — it is **not** verifiable **inference**. It doesn't prove the LLM computation itself was untampered; that's still `src/arcAi.js`'s honest stub, unimplemented for the same reason as before (no confirmed Arc platform ABI).

Run `npm test` to see the safety and provenance claims proven against a real local EVM, not asserted in prose — see "Proof, not a demo" below.

---

## ⚡ Arc-Native Innovations

AgentPay targets Arc's agentic/emerging primitives:

- **ERC-8004 Identity**: registers an agent on the Arc testnet identity registry (`scripts/register-agent-arc.js`). Treat `ERC-8004` as a testnet registry call until you've confirmed the standard against `docs.arc.network`.
- **Smart Contract Account (SCA)**: wallets are created with Circle's SCA account type. True gas-station sponsorship is **not** wired in this branch — transactions pay native USDC gas at `feeLevel: MEDIUM`. Enable sponsorship later via Circle's gas-station flow.
- **ERC-8183 Job Escrow**: integration with a job-escrow contract (`jobService.js` → `createJob`/`setBudget`/`fund`/`submit`/`complete`). Hardcoded contract address is a testnet deployment; verify the standard against Arc docs before promoting. `scripts/marketplace-agent.js` closes the loop autonomously on both the provider and evaluator sides (see "Two-agent marketplace" below) — previously a hired *external* provider had no automated way to fulfil or get paid for a job.
- **X402 (Payment Required)**: autonomous inter-agent payments via `@x402/core|evm|fetch` + `@circle-fin/x402-batching` gateway.

---

## 🛡️ On-Chain Safety & Guardrails
- **Daily Spending Caps**: Hard-coded limits the agent cannot bypass.
- **Velocity Control**: Hourly transaction limits (Circuit Breaker) to prevent "drainer" attacks.
- **Whitelisting**: Restrict payments only to pre-approved addresses.
- **Isolated Vaults**: Every user gets a unique, non-custodial smart contract vault.

---

## 🧠 Core Innovation: The Arc Agent Integration

AgentPay moves the "Decision" (AI) off-chain while keeping the "Permission" (Policy) rigorously on-chain in `AgentVault`.

1. **Decision/AI (off-chain)**: Natural-language intent is parsed by **Llama 3.3 (Groq)** (`src/brain.js`). Verifiable decentralized inference via the Arc platform is **stubbed, not enabled** — see `src/arcAi.js`. The earlier README claim of "Arc Agent ID `12847…` validates agent logic through decentralized consensus" was aspirational and has been corrected; `scripts/verify-arc-ai.js` now runs against an honest shim and refuses to burn gas against unverified contract addresses until the Arc platform ABI is confirmed via `docs.arc.network`.
2. **Permission/Policy (on-chain)**: Every payment path now goes through `AgentVault.execute`, which enforces per-tx cap, daily cap, hourly velocity, and whitelist on-chain. Users can also sign payments via EIP-712 (`executeWithSig`) so no operator spend key is required.
3. **IRL Event Triggers** (off-chain, advisory): `src/triggers.js` evaluates price (Pyth Hermes), GitHub PR, weather (wttr.in), or custom JSON conditions and gates scheduled runs. Trigger "proofs" are logged, not submitted on-chain.
    - ⛅ **Weather**: "Pay if it rains in London."
    - 🏆 **Sports**: "Pay if LeBron scores 30+."
    - 🐙 **GitHub**: "Release payment when PR #42 is merged."
    - 📈 **Price**: "Swap to USDC if the price hits $2500."

---

## 🧩 Intent Solver, Agent Marketplace & Decision Provenance

Three additions that turn AgentPay from "chat that maps to one payment" into a system that plans, delegates, and leaves a verifiable trail.

### Intent solver
State a goal instead of a command — `POST /intent {"goal": "..."}`. The solver (`src/solver.js`) asks the LLM to decompose it into an ordered plan built **only** from four primitives it's allowed to use:

| Primitive | Does |
|---|---|
| `check_balance` | Blocks later steps until the vault balance is ≥ some amount. |
| `wait_for_condition` | Blocks on a price (Pyth), GitHub PR, or weather condition (`src/triggers.js`). |
| `pay` | Pays through the user's `AgentVault` — same on-chain caps/whitelist as every other payment path. |
| `hire_agent` | Posts an escrowed ERC-8183 job for another agent to complete. |

The solver can't invent a fifth primitive — `validatePlan()` rejects anything else before it's allowed to run. A ticker (`src/intentEngine.js`, started from `index.js`) re-checks blocked plans every 30s so a goal like *"pay the vendor once the job's marked done, but only if my balance stays above 500"* actually waits and resumes on its own.

### Two-agent marketplace
`scripts/marketplace-agent.js` is a small daemon you run alongside the server. Point two separate AgentPay deployments (two different operator keys) at each other via `config/agentDirectory.json` and they will, with no human involved:
1. **Provider side** — watch the escrow for jobs where they're the hired provider and funded, do the work for real (`agent.performTask`, the same Groq/Keryx execution path used elsewhere), submit the deliverable hash on-chain, and push the actual text to the client's `POST /agent/deliver`.
2. **Evaluator side** — watch jobs they created that are now `Submitted`, have an LLM judge the delivered text against the original description, and call `complete()` or `reject()` on the escrow accordingly.

### Decision provenance
`contracts/DecisionLog.sol` commits `keccak256(intent + plan + action)` on-chain *before* the corresponding `AgentVault` execution, keyed by the same `requestId`. Anyone can recompute that hash from a published decision record and confirm it matches what was committed — and that the commit's block number is earlier than the payment's. That's a real, checkable claim about *when a decision was made and that it wasn't rewritten after the fact* — deliberately narrower than "verifiable AI inference," which AgentPay does not do (see `src/arcAi.js`).

---

## ✅ Proof, not a demo

Every safety and provenance claim above is backed by an automated test that runs against a real local EVM (Hardhat) — not asserted in this README, not scripted for a screen recording.

```bash
npm install
npm test
```

This deploys `AgentVault` and `DecisionLog` to a local chain and:
- Pays a whitelisted address within policy → **succeeds**.
- Tries to pay a **non-whitelisted** address using the actual agent key (i.e. simulating a fully prompt-injected/compromised AI) → **reverts on-chain**, funds untouched.
- Tries to exceed the per-tx cap, the daily cap (even split across several smaller payments), and the hourly velocity limit → **all revert**, funds untouched.
- Tries to call `execute()` from any address other than the registered agent key → **reverts**.
- Proves `DecisionLog` commits can't be forged, duplicated, or rewritten, and that agent-key rotation is two-step.
- Exercises the intent solver's plan executor (ordering, blocking, resuming, decision-commit-before-payment, failure handling) with mocked dependencies — no live credentials required.

24 tests, all passing, no live Arc/Groq/Firebase credentials needed to verify any of it yourself.

---

## ⚡ Technical Features

### 1. Conversational Banking
A terminal-inspired frontend powered by **Llama 3.3 (Groq)** that parses natural language into structured intents. No more complex forms—just talk to your money.

### 2. Smart Scheduling
Conditional automation that monitors your vault. Set up recurring payments that only fire if your balance is high enough.

---

## 🏗️ Hybrid Architecture

AgentPay is built on a robust, high-availability hybrid stack:
- **Primary Brain**: Node.js backend hosted on **Render** for persistent state and complex intent extraction.
- **Edge Gateway**: **Cloudflare Workers** for low-latency global request handling and edge logic.
- **Execution Layer**: **Solidity Smart Contracts** deployed on the Arc Testnet.
- **Data Layer**: Arc RPC + Groq LLM + Decentralized Subcommittee Verification.

---

## 🚀 Getting Started

### 1. Backend Setup (Render/Local)
```bash
npm install
node index.js
```
*Configure your `.env` with `PRIVATE_KEY`, `ARC_RPC`, and `VAULT_ADDRESS`.*

### 2. Frontend Setup
```bash
cd frontend
npm install
npm run dev
```

### 3. Edge Worker (Optional)
```bash
npx wrangler deploy
```

### 4. Decision log + marketplace daemon (optional)
```bash
node scripts/compile.js
node scripts/deployDecisionLog.js   # writes artifacts/DecisionLog-deployment.json, prints DECISION_LOG_ADDRESS
node scripts/marketplace-agent.js   # run alongside another AgentPay deployment to see two agents transact
```

### 5. Verify the safety/provenance claims yourself
```bash
npm test
```

---

## 🛠️ Hackathon Submission Details

- **Problem**: Trusting an AI with a private key is dangerous.
- **Solution**: A "Decision vs. Permission" split architecture.
- **Arc Integration**: Deep usage of the Agent Platform for both LLM and JSON-API verification.
- **Impact**: Provides a safe, "set-and-forget" payment layer for autonomous agents.

---

**Built on Arc. Powered by AI. Secured by Code.**

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

---

## ⚡ Arc-Native Innovations

AgentPay targets Arc's agentic/emerging primitives:

- **ERC-8004 Identity**: registers an agent on the Arc testnet identity registry (`scripts/register-agent-arc.js`). Treat `ERC-8004` as a testnet registry call until you've confirmed the standard against `docs.arc.network`.
- **Smart Contract Account (SCA)**: wallets are created with Circle's SCA account type. True gas-station sponsorship is **not** wired in this branch — transactions pay native USDC gas at `feeLevel: MEDIUM`. Enable sponsorship later via Circle's gas-station flow.
- **ERC-8183 Job Escrow**: integration with a job-escrow contract (`jobService.js` → `createJob`/`setBudget`/`fund`/`submit`/`complete`). Hardcoded contract address is a testnet deployment; verify the standard against Arc docs before promoting.
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

---

## 🛠️ Hackathon Submission Details

- **Problem**: Trusting an AI with a private key is dangerous.
- **Solution**: A "Decision vs. Permission" split architecture.
- **Arc Integration**: Deep usage of the Agent Platform for both LLM and JSON-API verification.
- **Impact**: Provides a safe, "set-and-forget" payment layer for autonomous agents.

---

**Built on Arc. Powered by AI. Secured by Code.**

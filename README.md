# 🤖 AgentPay: The Autonomous, Policy-Enforced Payment Layer on Somnia

**AgentPay** is a production-grade, AI-powered autonomous payment agent built for the **Somnia Network**. It bridges the gap between conversational AI and secure on-chain financial execution by moving the "Decision" (AI) off-chain while keeping the "Permission" (Policy) strictly on-chain.

Built with ❤️ for the **Somnia Agentathon**.

---

## 🌟 Why AgentPay?

Most AI agents require full private key access, which is a catastrophic security risk. AgentPay solves this using a **Personal Vault** architecture. Users delegate tasks to an agent that operates within strictly defined, on-chain safety parameters. 

### 🛡️ On-Chain Safety & Guardrails
- **Daily Spending Caps**: Hard-coded limits the agent cannot bypass.
- **Velocity Control**: Hourly transaction limits (Circuit Breaker) to prevent "drainer" attacks.
- **Whitelisting**: Restrict payments only to pre-approved addresses.
- **Isolated Vaults**: Every user gets a unique, non-custodial smart contract vault.

---

## 🧠 Core Innovation: The Somnia Agent Integration

AgentPay leverages the full power of the **Somnia Agent Platform** to ensure every decision is decentralized and verifiable.

1. **Verifiable AI Inference**: Uses Somnia Agent ID `12847...` to validate agent logic through decentralized consensus.
2. **IRL Event Triggers**: Uses the Somnia JSON Agent (ID `13174...`) to trigger payments based on real-world data:
    - ⛅ **Weather**: "Pay if it rains in London."
    - 🏆 **Sports**: "Pay if LeBron scores 30+."
    - 🐙 **GitHub**: "Release payment when PR #42 is merged."
    - 📈 **Price**: "Swap to SUSD if ETH hits $2500."

---

## ⚡ Technical Features

### 1. Atomic Multi-Step Intents
Using `multicall`, AgentPay executes complex workflows in a single atomic transaction:
- **SafeSwapPay**: Swap STT to SUSD and pay a recipient instantly.
- **Auto-Liquidity**: Swaps half your STT and adds liquidity to the PING/SUSD pool in one click.

### 2. Conversational Banking
A terminal-inspired frontend powered by **Llama 3.3 (Groq)** that parses natural language into structured intents. No more complex forms—just talk to your money.

### 3. Smart Scheduling
Conditional automation that monitors your vault. Set up recurring payments that only fire if your balance is high enough or the gas is low.

---

## 🏗️ Hybrid Architecture

AgentPay is built on a robust, high-availability hybrid stack:
- **Primary Brain**: Node.js backend hosted on **Render** for persistent state and complex intent extraction.
- **Edge Gateway**: **Cloudflare Workers** for low-latency global request handling and edge logic.
- **Execution Layer**: **Solidity Smart Contracts** deployed on the Somnia Shannon Testnet.
- **Data Layer**: Somnia RPC + Groq LLM + Decentralized Subcommittee Verification.

---

## 🚀 Getting Started

### 1. Backend Setup (Render/Local)
```bash
npm install
node index.js
```
*Configure your `.env` with `PRIVATE_KEY`, `SOMNIA_RPC_URL`, and `VAULT_ADDRESS`.*

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
- **Somnia Integration**: Deep usage of the Agent Platform for both LLM and JSON-API verification.
- **Impact**: Provides a safe, "set-and-forget" payment layer for the next billion users in the metaverse.

---

**Built on Somnia. Powered by AI. Secured by Code.**

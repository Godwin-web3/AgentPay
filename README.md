# 🤖 AgentPay: Your Autonomous DeFi Companion on Somnia

AgentPay is an AI-powered, policy-enforced autonomous payment agent built for the **Somnia Network**. It allows users to delegate financial tasks to an agent that operates within strictly defined, on-chain safety parameters.

## 🌟 Key Features

### 1. 🛡️ On-Chain Policy Enforcement
Unlike traditional agents that have full control over a wallet, AgentPay uses a **Personal Vault** smart contract. Users set on-chain limits that the agent *cannot* bypass:
- **Daily Spending Caps**: Total amount the agent can spend per day.
- **Per-Transaction Limits**: Maximum amount for any single execution.
- **Velocity Control**: Limits the number of transactions per hour to prevent "drainer" attacks.
- **Whitelisting**: Restrict payments only to approved addresses.

### 2. ⚡ Atomic Intents (Multi-Step Magic)
AgentPay can execute complex "Intents" in a single, atomic transaction using `multicall`.
- **Safe Swap + Pay**: Swap native STT to SUSD and pay a merchant in one go.
- **Autonomous Liquidity**: "Put 10 STT into the PING pool" — the agent swaps half and adds liquidity automatically.

### 3. ⏰ Smart Scheduling
Delegated automated payments with conditions. The agent can monitor your balance and only execute a payment (like a subscription or rent) if your Vault has sufficient funds.

### 4. 💬 Conversational Interface
A sleek, terminal-inspired frontend that lets you talk to your money. Powered by **Llama 3.3 (Groq)** for near-instant intent parsing.

---

## 🏗️ Architecture

- **Smart Contracts**: Solidity (deployed on Somnia Shannon Testnet).
- **Backend (Agent Core)**: Cloudflare Workers (High availability, globally distributed).
- **Frontend**: React + TypeScript + Ethers.js v6.
- **Brain**: Groq Llama-3.3-70b for intent extraction.

---

## 🚀 Quick Start

### Prerequisites
- Node.js v18+
- Metamask configured for **Somnia Shannon Testnet**
- Groq API Key

### Installation

1. **Clone & Install**
   ```bash
   git clone https://github.com/your-repo/agentpay
   cd agentpay
   npm install
   ```

2. **Configure Environment**
   Create a `.env` file in the root:
   ```env
   GROQ_API_KEY=your_key
   PRIVATE_KEY=your_agent_operator_key
   SOMNIA_RPC_URL=https://dream-rpc.somnia.network
   VAULT_ADDRESS=0x4471917E96271F688282ae283d62De0B5Be8084C
   ```

3. **Run Local Demo**
   ```bash
   node index.js
   ```

4. **Launch Frontend**
   ```bash
   cd frontend
   npm install
   npm run dev
   ```

---

## 🛠️ Hackathon Submission Details

- **Problem**: Most AI agents require full private key access, which is a massive security risk.
- **Solution**: AgentPay solves this by moving the "Decision" (AI) off-chain but the "Permission" (Policy) on-chain.
- **Innovation**: First-of-its-kind "Atomic Intent" engine on Somnia that combines swaps, payments, and liquidity provision in single transactions.

---

**Built with ❤️ for the Somnia Hackathon.**

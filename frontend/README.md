# 🎨 AgentPay Frontend

This is the conversational interface for **AgentPay**, an AI-powered, policy-enforced autonomous payment agent built for the Somnia Network.

## 🚀 Getting Started

### 1. Prerequisites
- Node.js v18+
- Metamask (configured for Somnia Shannon Testnet)
- The AgentPay Worker running (locally or deployed)

### 2. Configuration
Create a `.env` file in this directory:
```env
VITE_WORKER_URL=https://your-worker.workers.dev
VITE_RPC_URL=https://dream-rpc.somnia.network
VITE_VAULT_ADDRESS=0x27c9DE593d325EF3C8C7B859b02ec83EEac22602
```

### 3. Installation & Launch
```bash
npm install
npm run dev
```

## 📺 Demo Flow

1. **Onboarding**: Connect your wallet and set your initial spending policy.
2. **Terminal**: Use the chat interface to:
   - "Send 0.5 STT to 0x..." (Simple Payment)
   - "Swap 1 STT to SUSD and pay Bob" (Atomic Intent)
   - "Set a schedule to pay 1 STT every Friday" (Smart Scheduling)
3. **Policy**: View and update your on-chain spending limits.
4. **History**: Track all executed and scheduled transactions.

## 🛠️ Tech Stack
- **Framework**: React 19 + TypeScript
- **Bundler**: Vite 6
- **Web3**: Ethers.js v6
- **Styling**: Vanilla CSS (Terminal-inspired aesthetic)

---
Built for the Somnia Hackathon.

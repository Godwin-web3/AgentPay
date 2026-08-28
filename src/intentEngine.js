// src/intentEngine.js — wires src/solver.js's pure plan executor to the real
// AgentPay primitives: agent.pay / agent.hireAgent (which already route
// through AgentVault's on-chain policy — see src/agent.js), triggers.js for
// wait_for_condition, escrow.js for vault balance reads, and decisionLog.js
// for the on-chain decision-provenance commit/finalize.
//
// The plan-execution logic itself lives in src/solver.js and is unit tested
// there (test/solver.test.js) with mocked deps. This file only supplies the
// real deps and Firestore persistence (src/intentStore.js).

require('dotenv').config();
const { ethers } = require('ethers');
const solver = require('./solver');
const intentStore = require('./intentStore');
const decisionLog = require('./decisionLog');
const agent = require('./agent');
const { evaluateTrigger } = require('./triggers');
const escrow = require('./escrow');

function getOperatorWallet() {
  const provider = new ethers.JsonRpcProvider(process.env.ARC_RPC, { chainId: 5042002, name: 'arc-testnet' });
  return new ethers.Wallet(process.env.PRIVATE_KEY, provider);
}

// Decision-log commits are best-effort provenance, not authoritative safety —
// AgentVault.execute() enforces the real caps regardless of whether this
// succeeds. A DecisionLog outage must never block or fake a payment.
function buildDeps(walletId) {
  const wallet = getOperatorWallet();
  return {
    getVaultBalance: async (userAddress) => {
      const policy = await escrow.getOnChainPolicy(wallet, userAddress);
      return policy.vaultBalance;
    },
    evaluateTrigger: (condition) => evaluateTrigger(condition),
    pay: async (to, amount, reason, userAddress) => agent.pay(walletId, to, amount, reason, userAddress),
    hireAgent: async (description, budget, userAddress, providerAddress) => {
      const agentWalletId = process.env.AGENT_WALLET_ID;
      const agentAddress = process.env.AGENT_ADDRESS;
      const provider = providerAddress || agentAddress;
      const providerWalletId = providerAddress ? null : agentWalletId;
      return agent.hireAgent(walletId, providerWalletId, walletId, provider, userAddress, description, budget, userAddress);
    },
    commitDecision: async (requestId, record, summary) => {
      try {
        await decisionLog.commitDecision(wallet, requestId, record, summary);
      } catch (e) {
        console.error('[intentEngine] commitDecision failed (payment still runs — provenance is best-effort):', e.message);
      }
    },
    finalizeDecision: async (requestId, outcomeRecord) => {
      try {
        await decisionLog.finalizeDecision(wallet, requestId, outcomeRecord);
      } catch (e) {
        console.error('[intentEngine] finalizeDecision failed:', e.message);
      }
    },
    makeRequestId: (planId, stepIndex) => decisionLog.makeRequestId(planId, stepIndex),
    now: () => new Date().toISOString(),
  };
}

async function createIntent(goal, userAddress, walletId) {
  const wallet = getOperatorWallet();
  const policy = await escrow.getOnChainPolicy(wallet, userAddress);
  const plan = await solver.planFromGoal(goal, userAddress, policy.vaultBalance);

  const doc = {
    id: `intent_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    goal: plan.goal || goal,
    userAddress,
    walletId,
    steps: plan.steps,
    cursor: 0,
    status: 'active',
    log: [],
    createdAt: new Date().toISOString(),
  };

  await intentStore.createIntent(doc);
  const advanced = await solver.advancePlan(doc, buildDeps(walletId));
  await intentStore.saveIntent(advanced);
  return advanced;
}

async function tickIntent(doc) {
  if (doc.status !== 'active') return doc;
  const advanced = await solver.advancePlan(doc, buildDeps(doc.walletId));
  if (JSON.stringify(advanced) !== JSON.stringify(doc)) {
    await intentStore.saveIntent(advanced);
  }
  return advanced;
}

async function tickAllActiveIntents() {
  const active = await intentStore.listActiveIntents();
  const results = [];
  for (const doc of active) {
    try {
      results.push(await tickIntent(doc));
    } catch (e) {
      console.error(`[intentEngine] tick failed for ${doc.id}:`, e.message);
    }
  }
  return results;
}

let tickTimer = null;
function startTicker(intervalMs = 30000) {
  if (tickTimer) return;
  tickTimer = setInterval(() => {
    tickAllActiveIntents().catch((e) => console.error('[intentEngine] tick loop error:', e.message));
  }, intervalMs);
  console.log(`🧠 Intent engine ticking every ${intervalMs / 1000}s`);
}

function stopTicker() {
  if (tickTimer) {
    clearInterval(tickTimer);
    tickTimer = null;
  }
}

module.exports = {
  createIntent,
  tickIntent,
  tickAllActiveIntents,
  startTicker,
  stopTicker,
  getIntent: intentStore.getIntent,
  listIntents: intentStore.listIntents,
};

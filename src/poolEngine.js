// src/poolEngine.js — resolves PoolVault proposals once their objection
// window elapses. Mirrors src/intentEngine.js's ticker pattern.

require('dotenv').config();
const { ethers } = require('ethers');
const poolVault = require('./poolVault');
const poolStore = require('./poolStore');

function getOperatorWallet() {
  const provider = new ethers.JsonRpcProvider(process.env.ARC_RPC, { chainId: 5042002, name: 'arc-testnet' });
  return new ethers.Wallet(process.env.PRIVATE_KEY, provider);
}

async function tickOnce() {
  const pending = await poolStore.listPendingProposals();
  const now = Math.floor(Date.now() / 1000);
  const wallet = getOperatorWallet();

  for (const p of pending) {
    if (now < p.windowEnds) continue;
    try {
      const txHash = await poolVault.resolveProposal(wallet, p.proposalId);
      await poolStore.closeProposal(p.proposalId, { resolved: 'executed', txHash });
      console.log(`🤝 [poolEngine] resolved proposal ${p.proposalId}: executed (${txHash})`);
    } catch (err) {
      const reason = err.reason || err.shortMessage || err.message || 'unknown error';
      if (/ProposalVetoedError/i.test(reason)) {
        await poolStore.closeProposal(p.proposalId, { resolved: 'vetoed' });
        console.log(`🛑 [poolEngine] proposal ${p.proposalId} was vetoed — blocked, no funds moved`);
      } else if (/AlreadyResolved/i.test(reason)) {
        await poolStore.closeProposal(p.proposalId, { resolved: 'already-resolved' });
      } else {
        console.error(`[poolEngine] failed to resolve proposal ${p.proposalId}:`, reason);
      }
    }
  }
}

let tickTimer = null;
function startTicker(intervalMs = 60000) {
  if (tickTimer) return;
  tickTimer = setInterval(() => {
    tickOnce().catch((e) => console.error('[poolEngine] tick loop error:', e.message));
  }, intervalMs);
  console.log(`🤝 Pool engine ticking every ${intervalMs / 1000}s`);
}

function stopTicker() {
  if (tickTimer) {
    clearInterval(tickTimer);
    tickTimer = null;
  }
}

module.exports = { tickOnce, startTicker, stopTicker };

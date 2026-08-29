// src/poolEngine.js — resolves PoolVault proposals once their objection
// window elapses. Mirrors src/intentEngine.js's ticker pattern.

require('dotenv').config();
const { ethers } = require('ethers');
const poolVault = require('./poolVault');
const poolStore = require('./poolStore');
const { appendSpend } = require('./spendStore');

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
      try {
        const proposal = await poolVault.getProposal(wallet, p.proposalId);
        if (p.kind === 'Spend' && p.proposer) {
          await appendSpend({ userAddress: p.proposer, to: proposal.to, amount: proposal.amount, reason: proposal.reason || 'Pool spend', txHash, token: 'USDC', type: 'pool_spend' });
        }
        // Nobody knew this would go through until now (no objection landed
        // in time) — this is genuinely new information for the thread. A
        // veto, by contrast, is already announced immediately when it
        // happens (see server.js handleVetoProposal), so it isn't repeated here.
        const summary = p.kind === 'Spend'
          ? `✅ No objections — sent ${proposal.amount} USDC to ${proposal.to}.`
          : p.kind === 'AmendConstitution'
            ? '✅ No objections — the rules change is now in effect.'
            : '✅ No objections — the member was removed.';
        await poolStore.appendPoolMessage({ poolId: p.poolId, role: 'system', content: summary, proposalId: p.proposalId, messageType: 'system' });
      } catch (logErr) {
        console.error(`[poolEngine] failed to log resolved proposal ${p.proposalId}:`, logErr.message);
      }
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

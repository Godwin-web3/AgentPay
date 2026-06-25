require('dotenv').config();
const PolicyEngine = require('./policyEngine');
const walletService = require('./walletService');
const x402Client = require('./x402Client');
const escrow = require('./escrow');
const { appendSpend, appendFailure, getHistory } = require('../utils/store');
const { parseIntent } = require('./brain');
const jobService = require('./jobService');

// P1-7: off-chain PolicyEngine is now an ADVISORY pre-check only. The
// authoritative decision lives in AgentVault.execute (per-tx/daily/hourly caps,
// whitelist) invoked via escrow.executePayment. Failing the advisory check
// short-circuits before spending gas, but an advisory pass is NOT a guarantee —
// the vault may still revert on chain.
const engine = new PolicyEngine();

async function pay(walletId, to, amountUSDC, reason, userAddress) {
  const advisory = engine.check(to, amountUSDC, userAddress);
  if (!advisory.allowed) {
    appendFailure({ userAddress, to, amount: amountUSDC, reason, blockedReason: advisory.reason });
    return { success: false, reason: advisory.reason, code: advisory.code };
  }

  try {
    // P0-2: MUST go through the vault. Direct sendUSDC bypassed all on-chain
    // policy and is removed from the payment path. walletService.sendUSDC is
    // retained only for x402 facilitation where no vault exists for the payee.
    const { ethers } = require('ethers');
    const provider = new ethers.JsonRpcProvider(process.env.ARC_RPC);
    const agentKey = process.env.PRIVATE_KEY;
    if (!agentKey) throw new Error('No agent key configured (PRIVATE_KEY)');
    const wallet = new ethers.Wallet(agentKey, provider);

    const tx = await escrow.executePayment(wallet, userAddress, 'USDC', to, amountUSDC, reason || '', null);
    const txHash = tx.hash || tx.transactionHash;
    appendSpend({ userAddress, to, amount: amountUSDC, reason, txHash, token: 'USDC' });
    return { success: true, txHash };
  } catch (err) {
    const reasonText = err.reason || err.shortMessage || err.message || 'unknown error';
    appendFailure({ userAddress, to, amount: amountUSDC, reason, blockedReason: reasonText });

    // P2-12: if the vault reverted with a cap/whitelist violation, mirror it
    // into an on-chain emergency pause for this user to stop further attempts
    // until an operator resumes. Best-effort; failures here are non-fatal.
    if (/ExceedsDailyCap|ExceedsHourlyVelocity|ExceedsPerTxCap|NotWhitelisted|Too many/i.test(reasonText)) {
      try {
        const { ethers } = require('ethers');
        const provider = new ethers.JsonRpcProvider(process.env.ARC_RPC);
        const agentWallet = new ethers.Wallet(process.env.PRIVATE_KEY, provider);
        await escrow.pauseUser(agentWallet, userAddress);
      } catch (_) { /* best-effort */ }
    }
    return { success: false, reason: reasonText };
  }
}

async function fetchAndPay(walletId, url, maxAmount, reason, userAddress) {
  const advisory = engine.check(url, maxAmount, userAddress);
  if (!advisory.allowed) {
    appendFailure({ userAddress, to: url, amount: maxAmount, reason, blockedReason: advisory.reason });
    return { success: false, reason: advisory.reason, code: advisory.code };
  }

  try {
    // x402 paid fetch goes via the facilitator signer (raw USDC transfer); there
    // is no vault counterparty, so the advisory cap is the only enforcement.
    const isLocal = url.includes('localhost') || url.includes('127.0.0.1');
    const fetchOptions = isLocal ? {
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query: reason })
    } : {};
    const { data, actualAmount, actualPayTo } = await x402Client.fetchWithPayment(url, walletId, fetchOptions, userAddress);
    appendSpend({ userAddress, to: actualPayTo || url, amount: actualAmount || maxAmount, reason, txHash: 'x402', token: 'USDC' });
    return { success: true, data, actualAmount };
  } catch (err) {
    appendFailure({ userAddress, to: url, amount: maxAmount, reason, blockedReason: err.message });
    return { success: false, reason: err.message };
  }
}

async function getBalance(walletId) {
  return await walletService.getWalletBalance(walletId);
}

async function getSummary() {
  return engine.summary();
}

async function getUnifiedHistory(userAddress, limit = 50) {
  return getHistory(userAddress, limit);
}

async function chat(message, walletId, userAddress) {
  const balance = await walletService.getWalletBalance(walletId);
  const address = await walletService.getWalletAddress(walletId);
  const intent = await parseIntent(message, address, balance);
  if (intent.action === "balance") {
    intent.message = "Your USDC balance is " + balance + " USDC";
    intent.balance = balance;
    intent.address = address;
  }
  return intent;
}


async function hireAgent(clientWalletId, providerWalletId, evaluatorWalletId, providerAddress, evaluatorAddress, description, budget, userAddress) {
  try {
    const { jobId, txHash: createTxHash } = await jobService.createJob(clientWalletId, providerAddress, evaluatorAddress, description);
    await jobService.setBudget(providerWalletId, jobId, budget);
    const fundTxHash = await jobService.approveAndFund(clientWalletId, jobId, budget);

    appendSpend({ userAddress, to: providerAddress, amount: budget, reason: description, txHash: fundTxHash, token: 'USDC' });

    return { success: true, jobId, status: 'Funded', createTxHash, fundTxHash };
  } catch (err) {
    appendFailure({ userAddress, to: providerAddress, amount: budget, reason: description, blockedReason: err.message });
    return { success: false, reason: err.message };
  }
}

async function completeHiredJob(evaluatorWalletId, jobId, providerWalletId, deliverableText) {
  const { txHash: submitTxHash } = await jobService.submitDeliverable(providerWalletId, jobId, deliverableText);
  const completeTxHash = await jobService.completeJob(evaluatorWalletId, jobId);
  const job = await jobService.getJob(jobId);
  return { success: true, submitTxHash, completeTxHash, job };
}

module.exports = { pay, fetchAndPay, getBalance, getSummary, getUnifiedHistory, chat, hireAgent, completeHiredJob };
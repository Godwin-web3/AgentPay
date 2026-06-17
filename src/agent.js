require('dotenv').config();
const PolicyEngine = require('./policyEngine');
const walletService = require('./walletService');
const x402Client = require('./x402Client');
const { appendSpend, appendFailure, getHistory } = require('../utils/store');
const { parseIntent } = require('./brain');
const jobService = require('./jobService');

const engine = new PolicyEngine();

async function pay(walletId, to, amountUSDC, reason, userAddress) {
  const decision = await engine.check(to, amountUSDC);

  if (!decision.allowed) {
    appendFailure({ userAddress, to, amount: amountUSDC, reason, blockedReason: decision.reason });
    return { success: false, reason: decision.reason, code: decision.code };
  }

  try {
    const txId = await walletService.sendUSDC(walletId, to, amountUSDC);
    appendSpend({ userAddress, to, amount: amountUSDC, reason, txHash: txId, token: 'USDC' });
    return { success: true, txHash: txId };
  } catch (err) {
    appendFailure({ userAddress, to, amount: amountUSDC, reason, blockedReason: err.message });
    return { success: false, reason: err.message };
  }
}

async function fetchAndPay(walletId, url, maxAmount, reason, userAddress) {
  const decision = await engine.check(url, maxAmount);

  if (!decision.allowed) {
    appendFailure({ userAddress, to: url, amount: maxAmount, reason, blockedReason: decision.reason });
    return { success: false, reason: decision.reason, code: decision.code };
  }

  try {
    const { data, actualAmount, actualPayTo } = await x402Client.fetchWithPayment(url, walletId);
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

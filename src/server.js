require('dotenv').config();
const http = require('http');
const { pay, fetchAndPay, getBalance, getSummary, getUnifiedHistory, chat } = require('./agent');
const { readPolicy, applyUpdate } = require('./policyManager');
const { getTodaySpend } = require('../utils/store');
const { getAllJobs, addJob, cancelJob, parseInterval } = require('./scheduler');
const { gateway } = require('./gatewayMiddleware');
const express = require('express');
const app = express();
app.use(express.json());
const walletService = require('./walletService');

const PORT = process.env.PORT || 3000;

const requestStore = new Map();
const chatHistories = new Map();
const userWallets = new Map();
const WALLETS_FILE = require('path').join(__dirname, '../data/userWallets.json');

function loadWallets() {
  try {
    const { readFileSync } = require('fs');
    const saved = JSON.parse(readFileSync(WALLETS_FILE, 'utf8'));
    Object.entries(saved).forEach(([k, v]) => userWallets.set(k, v));
    console.log('Loaded', userWallets.size, 'wallets from disk');
  } catch(e) {}
}

function saveWallets() {
  const { writeFileSync, mkdirSync } = require('fs');
  const { dirname } = require('path');
  mkdirSync(dirname(WALLETS_FILE), { recursive: true });
  writeFileSync(WALLETS_FILE, JSON.stringify(Object.fromEntries(userWallets), null, 2));
}

loadWallets();

function send(res, status, data) {
  if (typeof res.status === 'function') {
    return res.status(status).json(data);
  }
  const body = JSON.stringify(data, null, 2);
  res.writeHead(status, {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type, x-user-id',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS, DELETE'
  });
  res.end(body);
}

function parseBody(req) {
  return new Promise((resolve) => {
    let data = '';
    req.on('data', chunk => data += chunk);
    req.on('end', () => {
      try { resolve(JSON.parse(data)); }
      catch { resolve({}); }
    });
  });
}

function getUserId(req) {
  return req.headers['x-user-id'] || 'anonymous';
}

async function getOrCreateWallet(userId) {
  if (userWallets.has(userId)) return userWallets.get(userId);
  const wallet = await walletService.createUserWallet(userId);
  userWallets.set(userId, wallet);
  saveWallets();
  return wallet;
}

// GET /health
function handleHealth(req, res) {
  return send(res, 200, {
    status: 'ok',
    agent: 'AgentPay',
    version: '3.0',
    network: 'Arc Testnet',
    chainId: 5042002,
    time: new Date().toISOString()
  });
}

// POST /wallet
async function handleCreateWallet(req, res) {
  const userId = getUserId(req);
  try {
    const wallet = await getOrCreateWallet(userId);
    const balance = await walletService.getWalletBalance(wallet.walletId);
    return send(res, 200, {
      walletId: wallet.walletId,
      address: wallet.address,
      balance,
      faucet: 'https://faucet.circle.com'
    });
  } catch (err) {
    return send(res, 500, { error: err.message });
  }
}

// GET /balance
async function handleBalance(req, res) {
  const userId = getUserId(req);
  try {
    const wallet = await getOrCreateWallet(userId);
    const balance = await walletService.getWalletBalance(wallet.walletId);
    return send(res, 200, { address: wallet.address, balance, token: 'USDC' });
  } catch (err) {
    return send(res, 500, { error: err.message });
  }
}

// GET /policy
async function handleGetPolicy(req, res) {
  const policy = readPolicy();
  const todaySpend = getTodaySpend();
  return send(res, 200, {
    maxAmountPerTx: policy.maxAmountPerTx,
    dailyLimit: policy.dailyLimit,
    todaySpent: parseFloat(todaySpend.toFixed(6)),
    dailyRemaining: parseFloat((policy.dailyLimit - todaySpend).toFixed(6)),
    whitelist: policy.whitelist,
    activeHours: policy.activeHours,
    circuitBreaker: policy.circuitBreaker
  });
}

// POST /policy
async function handleUpdatePolicy(req, res) {
  const body = await parseBody(req);
  const updated = applyUpdate(body);
  return send(res, 200, updated);
}

// GET /history
async function handleHistory(req, res) {
  const userId = getUserId(req);
  try {
    const items = await getUnifiedHistory(userId, 100);
    return send(res, 200, { items, total: items.length });
  } catch (err) {
    return send(res, 500, { error: err.message });
  }
}

// POST /chat
async function handleChat(req, res) {
  const userId = getUserId(req);
  const body = await parseBody(req);
  const { message } = body;

  if (!message) return send(res, 400, { error: 'Missing message' });

  res.writeHead(200, {
    'Content-Type': 'application/x-ndjson',
    'Access-Control-Allow-Origin': '*',
    'Transfer-Encoding': 'chunked'
  });

  try {
    const wallet = await getOrCreateWallet(userId);
    const intent = await chat(message, wallet.walletId, userId);

    const history = chatHistories.get(userId) || [];
    history.push({ role: 'user', content: message });
    history.push({ role: 'assistant', content: intent.message, intent });
    if (history.length > 20) history.splice(0, 2);
    chatHistories.set(userId, history);

    // Auto-execute safe actions
    if (intent.action === 'fetch_and_pay') {
      const result = await fetchAndPay(
        wallet.walletId, intent.url,
        intent.maxAmount, intent.reason, userId
      );
      res.write(JSON.stringify({ type: 'final', intent, result }) + '\n');
    } else {
      res.write(JSON.stringify({ type: 'final', intent }) + '\n');
    }
    res.end();
  } catch (err) {
    res.write(JSON.stringify({ type: 'error', error: err.message }) + '\n');
    res.end();
  }
}

// GET /chat
function handleGetChatHistory(req, res) {
  const userId = getUserId(req);
  return send(res, 200, { history: chatHistories.get(userId) || [] });
}

// DELETE /chat
function handleDeleteChat(req, res) {
  const userId = getUserId(req);
  chatHistories.delete(userId);
  return send(res, 200, { success: true });
}

// POST /pay
async function handlePay(req, res) {
  const userId = getUserId(req);
  const body = await parseBody(req);
  const { to, amount, reason, requestId } = body;

  if (!to || !amount || !requestId)
    return send(res, 400, { error: 'Missing: to, amount, requestId' });

  if (requestStore.has(requestId))
    return send(res, 200, { requestId, ...requestStore.get(requestId) });

  const record = { status: 'pending', to, amount: parseFloat(amount), timestamp: new Date().toISOString() };
  requestStore.set(requestId, record);

  const wallet = await getOrCreateWallet(userId);
  const result = await pay(wallet.walletId, to, parseFloat(amount), reason || 'API payment', userId);

  if (result.success) {
    record.status = 'executed';
    record.txHash = result.txHash;
    return send(res, 200, {
      requestId, status: 'executed',
      txHash: result.txHash,
      explorer: 'https://testnet.arcscan.app/tx/' + result.txHash
    });
  } else {
    record.status = 'rejected';
    record.error = result.reason;
    return send(res, 200, { requestId, status: 'rejected', reason: result.reason });
  }
}

// GET /schedules
function handleGetSchedules(req, res) {
  return send(res, 200, { schedules: getAllJobs() });
}

// POST /schedules
async function handleCreateSchedule(req, res) {
  const userId = getUserId(req);
  const body = await parseBody(req);
  const { to, amount, interval, reason } = body;

  const intervalMs = parseInterval(interval);
  if (!intervalMs) return send(res, 400, { error: 'Invalid interval' });

  const wallet = await getOrCreateWallet(userId);
  const job = addJob({ to, amount, reason, intervalMs, intervalLabel: interval, userAddress: userId });

  const { startJob } = require('./scheduler');
  startJob(job, (to, amount, reason) => pay(wallet.walletId, to, amount, reason, userId), userId);

  return send(res, 200, { success: true, schedule: job });
}

// DELETE /schedules/:id
function handleDeleteSchedule(req, res, jobId) {
  const job = cancelJob(jobId);
  if (!job) return send(res, 404, { error: 'Job not found' });
  return send(res, 200, { success: true });
}

// GET /status/:id
function handleStatus(req, res, requestId) {
  const record = requestStore.get(requestId);
  if (!record) return send(res, 404, { error: 'Request not found' });
  return send(res, 200, { requestId, ...record });
}



// POST /vault/deposit
async function handleVaultDeposit(req, res) {
  const userId = getUserId(req);
  const { amount } = req.body || {};
  try {
    const wallet = await getOrCreateWallet(userId);
    const vaultAddress = process.env.VAULT_FACTORY_ADDRESS;
    const txHash = await walletService.approveAndDepositToVault(wallet.walletId, vaultAddress, amount);
    return send(res, 200, { success: true, txHash, explorer: 'https://testnet.arcscan.app/tx/' + txHash });
  } catch (err) {
    return send(res, 500, { error: err.message });
  }
}

// POST /vault/withdraw
async function handleVaultWithdraw(req, res) {
  const userId = getUserId(req);
  const { amount } = req.body || {};
  try {
    const wallet = await getOrCreateWallet(userId);
    const vaultAddress = process.env.VAULT_FACTORY_ADDRESS;
    const txHash = await walletService.withdrawFromVault(wallet.walletId, vaultAddress, amount);
    return send(res, 200, { success: true, txHash, explorer: 'https://testnet.arcscan.app/tx/' + txHash });
  } catch (err) {
    return send(res, 500, { error: err.message });
  }
}

// POST /intelligence (x402 paid endpoint)
async function handleIntelligence(req, res) {
  const { query } = req.body || {};
  try {
    const intent = await require('./brain').parseIntent(query, 'system', '0');
    return send(res, 200, {
      query,
      result: intent.message || intent,
      payer: req.payment?.payer,
      amount: req.payment?.amount,
      network: req.payment?.network,
      timestamp: new Date().toISOString()
    });
  } catch (err) {
    return send(res, 500, { error: err.message });
  }
}


// POST /jobs (hire an agent via ERC-8183 escrow)
async function handleHireAgent(req, res) {
  const userId = getUserId(req);
  const { description, budget, providerAddress } = req.body || {};

  try {
    const wallet = await getOrCreateWallet(userId);
    const agentWalletId = process.env.AGENT_WALLET_ID;
    const agentAddress = process.env.AGENT_ADDRESS;
    const provider = providerAddress || agentAddress;
    const providerWalletId = providerAddress ? null : agentWalletId;

    const result = await require('./agent').hireAgent(
      wallet.walletId, providerWalletId, wallet.walletId,
      provider, wallet.address, description, budget, userId
    );
    return send(res, 200, result);
  } catch (err) {
    return send(res, 500, { error: err.message });
  }
}

// GET /jobs/:id
async function handleGetJob(req, res) {
  try {
    const job = await require('./jobService').getJob(req.params.id);
    return send(res, 200, job);
  } catch (err) {
    return send(res, 500, { error: err.message });
  }
}

// POST /jobs/:id/complete
async function handleCompleteJob(req, res) {
  const userId = getUserId(req);
  const { deliverableText } = req.body || {};
  try {
    const wallet = await getOrCreateWallet(userId);
    const agentWalletId = process.env.AGENT_WALLET_ID;
    const result = await require('./agent').completeHiredJob(
      wallet.walletId, req.params.id, agentWalletId, deliverableText || 'work completed'
    );
    return send(res, 200, result);
  } catch (err) {
    return send(res, 500, { error: err.message });
  }
}

// CORS
app.use((req, res, next) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, x-user-id');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS, DELETE');
  if (req.method === 'OPTIONS') return res.sendStatus(204);
  next();
});

app.get('/health', handleHealth);
app.post('/wallet', handleCreateWallet);
app.get('/balance', handleBalance);
app.get('/policy', handleGetPolicy);
app.post('/policy', handleUpdatePolicy);
app.get('/history', handleHistory);
app.post('/chat', handleChat);
app.get('/chat', handleGetChatHistory);
app.delete('/chat', handleDeleteChat);
app.post('/pay', handlePay);
app.get('/schedules', handleGetSchedules);
app.post('/schedules', handleCreateSchedule);
app.delete('/schedules/:id', (req, res) => handleDeleteSchedule(req, res, req.params.id));
app.get('/status/:id', (req, res) => handleStatus(req, res, req.params.id));
app.post('/vault/deposit', handleVaultDeposit);
app.post('/vault/withdraw', handleVaultWithdraw);
app.post('/jobs', handleHireAgent);
app.get('/jobs/:id', handleGetJob);
app.post('/jobs/:id/complete', handleCompleteJob);
app.post('/intelligence', gateway.require('$0.001'), handleIntelligence);

const server = require('http').createServer(app);

function startServer() {
  return new Promise((resolve) => {
    server.listen(PORT, () => {
      console.log('🌐 AgentPay API on http://localhost:' + PORT);
      resolve();
    });
  });
}

module.exports = { startServer };

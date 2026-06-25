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
    'Access-Control-Allow-Headers': 'Content-Type, x-user-address',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS, DELETE'
  });
  res.end(body);
}

// parseBody() removed — was incompatible with global express.json() middleware,
// caused requests to hang indefinitely. All routes now use req.body directly.

// P1-9: Authentication. `x-user-address` alone is spoofable and used to be the
// only "auth". We now require, in addition, a shared secret (`APP_API_KEY`)
// delivered via `x-api-key` / `Authorization: Bearer`. The frontend should hold
// a per-user key issued out-of-band; for Worker↔Render the operator key is used.
const APP_API_KEY = process.env.APP_API_KEY || '';

function reqApiKey(req) {
  const headerKey = req.headers['x-api-key'];
  if (headerKey) return String(headerKey);
  const auth = req.headers['authorization'] || req.headers['Authorization'];
  if (auth && String(auth).toLowerCase().startsWith('bearer ')) {
    return String(auth).slice(7).trim();
  }
  return '';
}

function checkAuth(req) {
  // Health check is public.
  if (!APP_API_KEY) return { ok: true }; // configured off in dev; warned on boot
  const key = reqApiKey(req);
  // constant-time-ish compare
  const a = Buffer.from(String(key));
  const b = Buffer.from(String(APP_API_KEY));
  return { ok: a.length === b.length && a.equals(b) };
}

function getUserId(req) {
  // Identity is still derived from the header, but can only be trusted once
  // checkAuth() has passed (middleware enforces).
  return req.headers['x-user-address'] || 'anonymous';
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
  const { ethers } = require('ethers');
  const userId = getUserId(req);
  const body = req.body || {};
  const { perTxCap, dailyCap, maxTxPerHour, whitelist } = body;

  if (!perTxCap || !dailyCap) {
    return send(res, 400, { error: 'perTxCap and dailyCap are required' });
  }

  try {
    const wallet = await getOrCreateWallet(userId);
    const userAddress = ethers.isAddress(userId) ? userId : wallet.address;
    const vaultAddress = await resolveOrCreateVault(userId);

    const { initiateDeveloperControlledWalletsClient } = require('@circle-fin/developer-controlled-wallets');
    const client = initiateDeveloperControlledWalletsClient({
      apiKey: process.env.CIRCLE_API_KEY,
      entitySecret: process.env.CIRCLE_ENTITY_SECRET
    });

    const tx = await client.createContractExecutionTransaction({
      walletId: wallet.walletId,
      contractAddress: vaultAddress,
      abiFunctionSignature: 'setPolicy(uint256,uint256,uint256,address[])',
      abiParameters: [
        ethers.parseUnits(String(perTxCap), 6).toString(),
        ethers.parseUnits(String(dailyCap), 6).toString(),
        String(maxTxPerHour || 20),
        whitelist || []
      ],
      fee: { type: 'level', config: { feeLevel: 'MEDIUM' } }
    });

    let txState = tx.data?.state;
    const txId = tx.data?.id;
    for (let i = 0; i < 30 && txState !== 'COMPLETE'; i++) {
      await new Promise(r => setTimeout(r, 2000));
      const status = await client.getTransaction({ id: txId });
      txState = status.data?.transaction?.state;
      if (txState === 'FAILED') throw new Error('setPolicy transaction failed');
    }

    return send(res, 200, {
      status: 'updated',
      userAddress,
      vaultAddress,
      perTxCap,
      dailyCap,
      maxTxPerHour: maxTxPerHour || 20,
      whitelist: whitelist || []
    });
  } catch (err) {
    return send(res, 500, { error: err.message });
  }
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
  const body = req.body || {};
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
  // express.json() middleware (line 10) already parses the body and consumes
  // the request stream. parseBody(req) re-reads the (now-exhausted) stream,
  // so its 'data'/'end' events never fire again and the await hangs forever.
  // Use Express's already-parsed req.body, same pattern as handleVaultDeposit.
  const { to, amount, reason, requestId } = req.body || {};

  if (!to || !amount || !requestId)
    return send(res, 400, { error: 'Missing: to, amount, requestId' });

  if (requestStore.has(requestId))
    return send(res, 200, { requestId, ...requestStore.get(requestId) });

  const record = { status: 'pending', to, amount: parseFloat(amount), timestamp: new Date().toISOString() };
  requestStore.set(requestId, record);

  const wallet = await getOrCreateWallet(userId);
  // pay() ultimately calls vault/contract methods requiring a real address.
  // userId may be a real address (production) or a test label — use the
  // wallet's resolved on-chain address instead, same pattern as resolveOrCreateVault.
  const result = await pay(wallet.walletId, to, parseFloat(amount), reason || 'API payment', wallet.address);

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
  const body = req.body || {};
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
    const vaultAddress = await resolveOrCreateVault(userId);
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
    const vaultAddress = await resolveOrCreateVault(userId);
    const txHash = await walletService.withdrawFromVault(wallet.walletId, vaultAddress, amount);
    return send(res, 200, { success: true, txHash, explorer: 'https://testnet.arcscan.app/tx/' + txHash });
  } catch (err) {
    return send(res, 500, { error: err.message });
  }
}

// POST /intelligence (x402 paid endpoint)
async function handleIntelligence(req, res) {
  console.log('handleIntelligence called, body:', req.body, 'payment:', req.payment);
  const { query } = req.body || {};
  if (!query) return send(res, 400, { error: 'Missing query' });
  try {
    const Groq = require('groq-sdk');
    const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });
    const completion = await groq.chat.completions.create({
      messages: [
        { role: 'system', content: 'You are a DeFi and crypto intelligence analyst. Answer questions with real data, clear analysis, and no fluff. Be concise but thorough.' },
        { role: 'user', content: query }
      ],
      model: process.env.GROQ_MODEL || 'llama-3.3-70b-versatile',
      temperature: 0.3,
      max_tokens: 1024
    });
    const result = completion.choices[0].message.content;
    return send(res, 200, {
      query,
      result,
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
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, x-user-address, x-api-key, Authorization');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS, DELETE');
  if (req.method === 'OPTIONS') return res.sendStatus(204);
  next();
});

// P1-9: require API key on all routes except /health and OPTIONS.
app.use((req, res, next) => {
  if (req.path === '/health') return next();
  const { ok } = checkAuth(req);
  if (!ok) return res.status(401).json({ error: 'Unauthorized: invalid or missing API key' });
  next();
});

if (!APP_API_KEY) {
  console.warn('⚠️  APP_API_KEY not set — running in UNAUTHENTICATED dev mode. Do NOT deploy this way.');
}


// GET /vault-check
async function handleVaultCheck(req, res) {
  const userId = getUserId(req);
  try {
    const { ethers } = require('ethers');
    const escrow = require('./escrow');

    // Resolve to a real address the same way resolveOrCreateVault does,
    // but without creating a wallet as a side effect of a read-only check.
    let userAddress;
    if (ethers.isAddress(userId)) {
      userAddress = userId;
    } else if (userWallets.has(userId)) {
      userAddress = userWallets.get(userId).address;
    } else {
      // No real address and no existing wallet under this label — nothing to check yet.
      return send(res, 200, { exists: false, address: null });
    }

    const vaultAddr = await escrow.findVault(userAddress);
    return send(res, 200, { exists: !!vaultAddr, address: vaultAddr });
  } catch (err) {
    return send(res, 500, { error: err.message });
  }
}

// GET /vault-address (find or create via Circle wallet as signer)
// Shared: resolve a user's per-vault address, creating it on-chain if missing

async function setDefaultPolicy(client, walletId, vaultAddress, userAddress) {
  const { ethers } = require('ethers');
  const provider = new ethers.JsonRpcProvider(process.env.ARC_RPC);
  const vault = new ethers.Contract(
    vaultAddress,
    ['function getPolicy(address user) view returns (tuple(uint256 perTxCap, uint256 dailyCap, uint256 maxTxPerHour, bool active) policy, address[] whitelist)'],
    provider
  );
  const [policy] = await vault.getPolicy(userAddress);
  if (policy.active) {
    console.log('Policy already set for', userAddress, '— skipping default');
    return;
  }
  console.log('Setting default policy for', userAddress);
  const tx = await client.createContractExecutionTransaction({
    walletId,
    contractAddress: vaultAddress,
    abiFunctionSignature: 'setPolicy(uint256,uint256,uint256,address[])',
    abiParameters: [
      ethers.parseUnits('1', 6).toString(),
      ethers.parseUnits('10', 6).toString(),
      '20',
      []
    ],
    fee: { type: 'level', config: { feeLevel: 'MEDIUM' } }
  });
  let txState = tx.data?.state;
  const txId = tx.data?.id;
  for (let i = 0; i < 30 && txState !== 'COMPLETE'; i++) {
    await new Promise(r => setTimeout(r, 2000));
    const status = await client.getTransaction({ id: txId });
    txState = status.data?.transaction?.state;
    if (txState === 'FAILED') throw new Error('setPolicy transaction failed');
  }
  console.log('Default policy set for', userAddress);
}

async function resolveOrCreateVault(userId) {
  const escrow = require('./escrow');
  const { ethers } = require('ethers');

  // userId may be a real address (production) or a test label (e.g. 'test-user-1').
  // Resolve to the wallet's actual on-chain address before any contract call,
  // since vault ownership must be keyed by a real address either way.
  const wallet = await getOrCreateWallet(userId);
  const userAddress = ethers.isAddress(userId) ? userId : wallet.address;

  let vaultAddr = await escrow.findVault(userAddress);

  if (!vaultAddr) {
    console.log('Creating vault on-chain for', userAddress, '(userId:', userId + ')');
    const client = require('@circle-fin/developer-controlled-wallets').initiateDeveloperControlledWalletsClient({
      apiKey: process.env.CIRCLE_API_KEY,
      entitySecret: process.env.CIRCLE_ENTITY_SECRET
    });
    const factoryAddress = process.env.VAULT_FACTORY_ADDRESS;

    const tx = await client.createContractExecutionTransaction({
      walletId: wallet.walletId,
      contractAddress: factoryAddress,
      abiFunctionSignature: 'createVault(address)',
      abiParameters: [userAddress],
      fee: { type: 'level', config: { feeLevel: 'MEDIUM' } }
    });

    let txState = tx.data?.state;
    const txId = tx.data?.id;
    for (let i = 0; i < 30 && txState !== 'COMPLETE'; i++) {
      await new Promise(r => setTimeout(r, 2000));
      const status = await client.getTransaction({ id: txId });
      txState = status.data?.transaction?.state;
      if (txState === 'FAILED') throw new Error('Vault creation transaction failed');
    }

    vaultAddr = await escrow.findVault(userAddress);
    await setDefaultPolicy(client, wallet.walletId, vaultAddr, userAddress);
  }

  return vaultAddr;
}

async function handleVaultAddress(req, res) {
  const userAddress = getUserId(req);
  try {
    const vaultAddr = await resolveOrCreateVault(userAddress);
    return send(res, 200, { address: vaultAddr });
  } catch (err) {
    return send(res, 500, { error: err.message });
  }
}

app.get('/health', handleHealth);
app.get('/vault-check', handleVaultCheck);
app.get('/vault-address', handleVaultAddress);
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

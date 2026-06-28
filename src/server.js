require('dotenv').config();
const http = require('http');
const { ethers } = require('ethers');
const { pay, fetchAndPay, getBalance, getSummary, getUnifiedHistory, chat } = require('./agent');
const { readPolicy, applyUpdate } = require('./policyManager');
const { getTodaySpend } = require('../utils/store');
const { getAllJobs, addJob, cancelJob, parseInterval } = require('./scheduler');
const { gateway } = require('./gatewayMiddleware');
const escrow = require('./escrow');
const express = require('express');
const app = express();

// Express 5 (path-to-regexp v8) requires routes here to be matched with a
// trailing slash that Express 4 treated as optional. Normalize incoming
// paths once, here, so both our exempt-list check and Express's router
// see the same consistent path shape.


// Request logging — method, path, status, duration. Helps debug silent
// failures on Render's cold-start-prone free tier where errors otherwise
// vanish into gaps between deploy logs.
app.use((req, res, next) => {
  const start = Date.now();
  res.on('finish', () => {
    console.log(`${req.method} ${req.path} -> ${res.statusCode} (${Date.now() - start}ms)`);
  });
  next();
});
app.use(express.json());
const walletService = require('./walletService');

const EXPLORER = 'https://testnet.arcscan.arc.network/tx/';

const PORT = process.env.PORT || 3000;

const requestStore = new Map();
const chatHistories = new Map();
const walletStore = require('./walletStore');

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

// parseBody() removed — was incompatible with global express.json() middleware,
// caused requests to hang indefinitely. All routes now use req.body directly.

// Auth: x-user-id contains the Firebase uid. Spoofable on testnet but tied to Google Auth session.

// Normalize trailing slashes - Express 5 does not auto-strip them
app.use((req, res, next) => {
  if (req.path !== '/' && req.path.endsWith('/')) {
    req.url = req.path.slice(0, -1) + req.url.slice(req.path.length);
  }
  next();
});
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
  const uid = req.headers['x-user-id'];
  if (!uid || uid === 'anonymous') throw new Error('Missing user identity');
  return uid;
}

async function getOrCreateWallet(userId) {
  const existing = await walletStore.getWallet(userId);
  if (existing) return existing;
  const wallet = await walletService.createUserWallet(userId);
  const record = {
    walletId: wallet.walletId,
    address: wallet.address,
    email: null,
    displayName: null,
    tag: null,
    createdAt: new Date().toISOString()
  };
  await walletStore.setWallet(userId, record);
  return record;
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
  const userId = getUserId(req);
  try {
    const wallet = await getOrCreateWallet(userId);
    const agentAddress = wallet.address;
    const offChain = readPolicy();

    // Per-user on-chain policy is keyed to the Circle agent wallet address.
    const vaultAddr = await escrow.findVault(agentAddress);
    if (!vaultAddr) {
      return send(res, 200, {
        perTxCap: offChain.maxAmountPerTx,
        dailyCap: offChain.dailyLimit,
        dailySpendSoFar: 0,
        dailyRemaining: offChain.dailyLimit,
        whitelist: [],
        active: false,
        activeHours: offChain.activeHours,
        circuitBreaker: offChain.circuitBreaker,
        vaultBalance: 0
      });
    }

    const provider = new ethers.JsonRpcProvider(process.env.ARC_RPC, { chainId: 5042002, name: "arc-testnet" });
    const onChain = await escrow.getOnChainPolicy(provider, agentAddress);
    return send(res, 200, {
      perTxCap: onChain.perTxCap,
      dailyCap: onChain.dailyCap,
      dailySpendSoFar: onChain.todaySpent,
      dailyRemaining: Math.max(0, onChain.dailyCap - onChain.todaySpent),
      whitelist: onChain.whitelist || [],
      active: onChain.active,
      maxTxPerHour: onChain.maxTxPerHour,
      activeHours: offChain.activeHours,
      circuitBreaker: offChain.circuitBreaker,
      vaultBalance: onChain.vaultBalance
    });
  } catch (err) {
    return send(res, 500, { error: err.message });
  }
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
    const userAddress = wallet.address;
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

    // Resolve @tags to wallet addresses
    if (intent.to && intent.to.startsWith('@')) {
      const tag = intent.to.toLowerCase().replace('@', '');
      const entry = await walletStore.findByTag(tag);
      if (entry) {
        intent.to = entry.address;
        intent.message = intent.message + ' (@' + tag + ' resolved to ' + entry.address.slice(0,8) + '...)';
      } else {
        res.write(JSON.stringify({ type: 'error', error: 'Tag @' + tag + ' not found' }) + '\n');
        res.end();
        return;
      }
    }

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
      res.write(JSON.stringify({ type: 'final', intent, message: intent.message, data: intent.data || null, result }) + '\n');
    } else {
      res.write(JSON.stringify({ type: 'final', intent, message: intent.message, data: intent.data || null }) + '\n');
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
      explorer: EXPLORER + result.txHash
    });
  } else {
    record.status = 'rejected';
    record.error = result.reason;
    return send(res, 200, { requestId, status: 'rejected', reason: result.reason });
  }
}

// GET /schedules
function handleGetSchedules(req, res) {
  const userId = getUserId(req);
  return send(res, 200, { schedules: getAllJobs(userId) });
}

// POST /schedules
async function handleCreateSchedule(req, res) {
  const userId = getUserId(req);
  const body = req.body || {};
  const { to, amount, interval, reason } = body;

  const intervalMs = parseInterval(interval);
  if (!intervalMs) return send(res, 400, { error: 'Invalid interval' });

  const wallet = await getOrCreateWallet(userId);
  // Key the job to the userId (browser address) for lookup, but execute payments
  // with the agent wallet address so vault balances/policies line up.
  const job = addJob({ to, amount, reason, intervalMs, intervalLabel: interval, userAddress: userId, agentAddress: wallet.address });

  const { startJob } = require('./scheduler');
  startJob(job, (to, amount, reason) => pay(wallet.walletId, to, amount, reason, wallet.address), userId);

  return send(res, 200, { success: true, schedule: job });
}

// DELETE /schedules/:id
function handleDeleteSchedule(req, res, jobId) {
  const userId = getUserId(req);
  const job = cancelJob(jobId, userId);
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
    return send(res, 200, { success: true, txHash, explorer: EXPLORER + txHash });
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
    return send(res, 200, { success: true, txHash, explorer: EXPLORER + txHash });
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

// GET /vault/balance — on-chain vault balance keyed to the agent wallet
async function handleVaultBalance(req, res) {
  const userId = getUserId(req);
  try {
    const wallet = await getOrCreateWallet(userId);
    const agentAddress = wallet.address;
    const vaultAddr = await escrow.findVault(agentAddress);
    if (!vaultAddr) return send(res, 200, { balance: '0.0000', address: null, agentAddress });
    const provider = new ethers.JsonRpcProvider(process.env.ARC_RPC, { chainId: 5042002, name: "arc-testnet" });
    const onChain = await escrow.getOnChainPolicy(provider, agentAddress);
    return send(res, 200, {
      balance: String(onChain.vaultBalance),
      address: vaultAddr,
      agentAddress
    });
  } catch (err) {
    return send(res, 500, { error: err.message });
  }
}

// GET /vault/paused — read on-chain userPaused[agentAddress]
async function handleVaultPaused(req, res) {
  const userId = getUserId(req);
  try {
    const wallet = await getOrCreateWallet(userId);
    const agentAddress = wallet.address;
    const vaultAddr = await escrow.findVault(agentAddress);
    if (!vaultAddr) return send(res, 200, { paused: false });
    const provider = new ethers.JsonRpcProvider(process.env.ARC_RPC, { chainId: 5042002, name: "arc-testnet" });
    const vault = new ethers.Contract(vaultAddr, ['function userPaused(address) view returns (bool)'], provider);
    const paused = await vault.userPaused(agentAddress);
    return send(res, 200, { paused: !!paused });
  } catch (err) {
    return send(res, 500, { error: err.message });
  }
}

// POST /vault/pause / POST /vault/resume — operator best-effort (onlyOwner).
// For factory-deployed vaults owner == VaultFactory, so this will fail; for
// single VAULT_ADDRESS mode owner is the deployer and this succeeds.
async function handleVaultPause(req, res, action) {
  const userId = getUserId(req);
  try {
    const wallet = await getOrCreateWallet(userId);
    const agentAddress = wallet.address;
    const vaultAddr = await escrow.findVault(agentAddress);
    if (!vaultAddr) return send(res, 404, { error: 'No vault found' });
    const provider = new ethers.JsonRpcProvider(process.env.ARC_RPC, { chainId: 5042002, name: "arc-testnet" });
    const agentKey = process.env.PRIVATE_KEY;
    if (!agentKey) throw new Error('No operator key configured (PRIVATE_KEY)');
    const signer = new ethers.Wallet(agentKey, provider);
    const fn = action === 'resume' ? escrow.resumeUser : escrow.pauseUser;
    const tx = await fn(signer, agentAddress);
    return send(res, 200, { success: true, txHash: tx.hash });
  } catch (err) {
    return send(res, 500, { error: err.message });
  }
}

// GET /onchain-schedules — schedules keyed to the agent wallet
async function handleGetOnChainSchedules(req, res) {
  const userId = getUserId(req);
  try {
    const wallet = await getOrCreateWallet(userId);
    const agentAddress = wallet.address;
    const vaultAddr = await escrow.findVault(agentAddress);
    if (!vaultAddr) return send(res, 200, { schedules: [] });
    const provider = new ethers.JsonRpcProvider(process.env.ARC_RPC, { chainId: 5042002, name: "arc-testnet" });
    const schedules = await escrow.getOnChainSchedules(provider, agentAddress);
    return send(res, 200, { schedules });
  } catch (err) {
    return send(res, 500, { error: err.message });
  }
}

// POST /onchain-schedules — Circle-signed createSchedule (keys to agent wallet)
async function handleCreateOnChainSchedule(req, res) {
  const userId = getUserId(req);
  const { to, amount, interval, reason, minBalance } = req.body || {};
  try {
    if (!to || !amount || !interval) return send(res, 400, { error: 'to, amount, interval required' });
    const wallet = await getOrCreateWallet(userId);
    const vaultAddress = await resolveOrCreateVault(userId);
    const txHash = await walletService.createVaultSchedule(
      wallet.walletId, vaultAddress, to, amount, Number(interval), reason || '', minBalance || 0
    );
    return send(res, 200, { success: true, txHash, explorer: EXPLORER + txHash });
  } catch (err) {
    return send(res, 500, { error: err.message });
  }
}

// DELETE /onchain-schedules/:index — Circle-signed cancelSchedule
async function handleCancelOnChainSchedule(req, res) {
  const userId = getUserId(req);
  const index = Number(req.params.index);
  try {
    const wallet = await getOrCreateWallet(userId);
    const vaultAddress = await resolveOrCreateVault(userId);
    const txHash = await walletService.cancelVaultSchedule(wallet.walletId, vaultAddress, index);
    return send(res, 200, { success: true, txHash, explorer: EXPLORER + txHash });
  } catch (err) {
    return send(res, 500, { error: err.message });
  }
}

// POST /log-transaction — record an off-chain activity entry for the history view
async function handleLogTransaction(req, res) {
  const userId = getUserId(req);
  const { appendSpend } = require('../utils/store');
  const body = req.body || {};
  try {
    appendSpend({
      userAddress: userId,
      to: body.to || null,
      amount: Number(body.amount) || 0,
      reason: body.reason || '',
      txHash: body.txHash || '',
      token: body.token || 'USDC'
    });
    return send(res, 200, { success: true });
  } catch (err) {
    return send(res, 500, { error: err.message });
  }
}

// CORS
app.use((req, res, next) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, x-user-id, x-api-key, Authorization');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS, DELETE');
  if (req.method === 'OPTIONS') return res.sendStatus(204);
  next();
});

// P1-9: require API key on all routes except /health and OPTIONS.
app.use((req, res, next) => {
  // Public/health routes, plus user-facing routes already protected by
  // Firebase-backed x-user-id auth. APP_API_KEY is reserved for genuinely
  // privileged/internal calls (e.g. Worker -> Render), not browser clients.
  const exempt = [
    '/health',
    '/api/stats',
    '/api/auth/login',
    '/api/me',
    '/api/tag/claim',
  ];
  const normalizedPath = req.path.endsWith('/') ? req.path.slice(0, -1) : req.path;
  if (exempt.includes(normalizedPath) || normalizedPath.startsWith('/api/tag/')) return next();
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
    // Vault on-chain state is keyed to the Circle agent wallet address.
    // Resolve it (idempotent — creates an empty wallet only if none exists yet).
    const wallet = await getOrCreateWallet(userId);
    const agentAddress = wallet.address;

    const vaultAddr = await escrow.findVault(agentAddress);
    return send(res, 200, { exists: !!vaultAddr, address: vaultAddr });
  } catch (err) {
    return send(res, 500, { error: err.message });
  }
}

// GET /vault-address (find or create via Circle wallet as signer)
// Shared: resolve a user's per-vault address, creating it on-chain if missing

async function setDefaultPolicy(client, walletId, vaultAddress, agentAddress) {
  const provider = new ethers.JsonRpcProvider(process.env.ARC_RPC, { chainId: 5042002, name: "arc-testnet" });
  const vault = new ethers.Contract(
    vaultAddress,
    ['function getPolicy(address user) view returns (tuple(uint256 perTxCap, uint256 dailyCap, uint256 maxTxPerHour, bool active) policy, address[] whitelist)'],
    provider
  );
  const [policy] = await vault.getPolicy(agentAddress);
  if (policy.active) {
    console.log('Policy already set for', agentAddress, '— skipping default');
    return;
  }
  console.log('Setting default policy for', agentAddress);
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
  console.log('Default policy set for', agentAddress);
}

async function resolveOrCreateVault(userId) {
  // All vault on-chain state (balances, policies, schedules, userPaused) is keyed
  // to whichever address signs deposit/withdraw/setPolicy/createSchedule — i.e.
  // the Circle agent wallet. So we both look up AND create the vault under the
  // agent wallet address, keeping a single consistent key for every user.
  const wallet = await getOrCreateWallet(userId);
  const agentAddress = wallet.address;

  let vaultAddr = await escrow.findVault(agentAddress);

  if (!vaultAddr) {
    console.log('Creating vault on-chain for', agentAddress, '(userId:', userId + ')');
    const client = require('@circle-fin/developer-controlled-wallets').initiateDeveloperControlledWalletsClient({
      apiKey: process.env.CIRCLE_API_KEY,
      entitySecret: process.env.CIRCLE_ENTITY_SECRET
    });
    const factoryAddress = process.env.VAULT_FACTORY_ADDRESS;

    const tx = await client.createContractExecutionTransaction({
      walletId: wallet.walletId,
      contractAddress: factoryAddress,
      abiFunctionSignature: 'createVault(address)',
      abiParameters: [agentAddress],
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

    vaultAddr = await escrow.findVault(agentAddress);
    await setDefaultPolicy(client, wallet.walletId, vaultAddr, agentAddress);
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
app.get('/vault/balance', handleVaultBalance);
app.get('/vault/paused', handleVaultPaused);
app.post('/vault/pause', (req, res) => handleVaultPause(req, res, 'pause'));
app.post('/vault/resume', (req, res) => handleVaultPause(req, res, 'resume'));
app.get('/onchain-schedules', handleGetOnChainSchedules);
app.post('/onchain-schedules', handleCreateOnChainSchedule);
app.delete('/onchain-schedules/:index', handleCancelOnChainSchedule);
app.post('/log-transaction', handleLogTransaction);
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

// Google Auth login - create Circle wallet for new users
app.post('/api/auth/login', async (req, res) => {
  try {
    const { uid, email, displayName } = req.body;
    if (!uid) return res.status(400).json({ error: 'uid required' });

    let wallet = await walletStore.getWallet(uid);

    if (!wallet) {
      const walletService = require('./walletService');
      const created = await walletService.createUserWallet(uid);
      wallet = {
        walletId: created.walletId,
        address: created.address,
        email,
        displayName,
        tag: null,
        createdAt: new Date().toISOString()
      };
      await walletStore.setWallet(uid, wallet);
      console.log('New user wallet created:', uid, created.address);
    }

    res.json({ wallet });
  } catch (err) {
    console.error('Auth login error:', err);
    res.status(500).json({ error: err.message });
  }
});

// Tag system
app.post('/api/tag/claim', async (req, res) => {
  try {
    const uid = req.headers['x-user-id'];
    if (!uid || uid === 'anonymous') return res.status(401).json({ error: 'Not authenticated' });
    const { tag } = req.body;
    if (!tag) return res.status(400).json({ error: 'tag required' });

    const clean = tag.toLowerCase().replace(/[^a-z0-9_]/g, '');
    if (clean.length < 3 || clean.length > 20) return res.status(400).json({ error: 'Tag must be 3-20 characters' });

    const taken = await walletStore.findByTag(clean);
    if (taken) return res.status(409).json({ error: 'Tag already taken' });

    const userWallet = await walletStore.getWallet(uid);
    if (!userWallet) return res.status(404).json({ error: 'User not found. Sign in first.' });

    userWallet.tag = clean;
    await walletStore.setWallet(uid, userWallet);

    res.json({ tag: clean, address: userWallet.address });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/tag/:tag', async (req, res) => {
  try {
    const tag = req.params.tag.toLowerCase().replace('@', '');
    const entry = await walletStore.findByTag(tag);
    if (!entry) return res.status(404).json({ error: 'Tag not found' });

    res.json({ tag, address: entry.address });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/me', async (req, res) => {
  try {
    const uid = req.headers['x-user-id'];
    if (!uid || uid === 'anonymous') return res.status(401).json({ error: 'Not authenticated' });

    const user = await walletStore.getWallet(uid);
    if (!user) return res.status(404).json({ error: 'User not found' });

    res.json({ uid, ...user });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Live stats for landing page
app.get('/api/stats', (req, res) => {
  try {
    const fs = require('fs');
    const path = require('path');

    let spendLog = [];
    try { spendLog = JSON.parse(fs.readFileSync(path.join(__dirname, '../data/spendLog.json'), 'utf8')); } catch {}

    let schedules = { jobs: [] };
    try { schedules = JSON.parse(fs.readFileSync(path.join(__dirname, '../data/schedules.json'), 'utf8')); } catch {}

    Promise.resolve(walletStore.getAllWallets()).then(wallets => {
      const totalVolume = spendLog.reduce((sum, tx) => sum + parseFloat(tx.amount || 0), 0);
      const userCount = Object.keys(wallets).length;
      const txCount = spendLog.length;
      const activeSchedules = (schedules.jobs || []).filter(j => j.active).length;

      res.json({
        users: userCount,
        transactions: txCount,
        volume: totalVolume.toFixed(2),
        schedules: activeSchedules
      });
    }).catch(err => {
      res.status(500).json({ error: err.message });
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

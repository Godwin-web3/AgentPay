require('dotenv').config();
const http = require('http');
const { ethers } = require('ethers');
const sharedProvider = require('./provider');
const { pay, fetchAndPay, getBalance, getSummary, getUnifiedHistory, chat } = require('./agent');
const { readPolicy, applyUpdate } = require('./policyManager');
const { getTodaySpend } = require('../utils/store');
const { getAllJobs, addJob, cancelJob, parseInterval } = require('./scheduler');
const { gateway } = require('./gatewayMiddleware');
const escrow = require('./escrow');
const express = require('express');
const app = express();
const { getProvider, getChain, listChains, txUrl } = require('./chain');

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

const EXPLORER = getChain().explorer + '/tx/';

const PORT = process.env.PORT || 3000;

const requestStore = new Map();
const chatStore = require('./chatStore');
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
  throw new Error('No wallet yet. Sign in again.');
}

async function ensureChainWallet(userId, _chain) {
  return getOrCreateWallet(userId);
}

// GET /health
function handleHealth(req, res) {
  const chain = getChain();
  const base = require('./chainRegistry').recall('base');
  const robinhood = require('./chainRegistry').recall('robinhood-testnet');
  return send(res, 200, {
    status: 'ok',
    agent: 'AgentPay',
    version: '3.0',
    network: chain.name,
    chainId: chain.chainId,
    chain: chain.id,
    base: base ? {
      status: base.status,
      vault: base.vault || null,
      executor: base.executor || null,
      reason: base.reason || null,
    } : { status: 'pending' },
    robinhoodTestnet: robinhood ? {
      status: robinhood.status,
      vault: robinhood.vault || null,
      token: robinhood.tokenSymbol || null,
      reason: robinhood.reason || null,
    } : { status: 'pending' },
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

    const provider = sharedProvider;
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

    // Keep the local advisory-check cache (config/policy.json) in sync with
    // the on-chain policy that was just set, so PolicyEngine's fast local
    // pre-check never drifts from reality again.
    applyUpdate({ perTxCap, dailyCap, whitelist });

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
    // Historical entries were written under two different keys — the
    // Firebase UID (deposits, withdrawals, job hires) and the resolved
    // on-chain wallet address (payments, job completions, pool activity).
    // Query both so nothing written under either convention is missed.
    const wallet = await getOrCreateWallet(userId);
    const keys = [userId, wallet.address];
    const baseAddress = wallet.chainWallets && wallet.chainWallets.base && wallet.chainWallets.base.address;
    if (baseAddress) keys.push(baseAddress);
    let items = await getUnifiedHistory(keys, 100);
    if (baseAddress) {
      try {
        const chainItems = await require('./baseBalance').baseDepositHistory(baseAddress);
        const seen = new Set(items.map((item) => item.txHash).filter(Boolean));
        for (const item of chainItems) {
          const existing = items.find((row) => row.txHash && row.txHash === item.txHash);
          if (existing) {
            existing.reason = item.reason;
            existing.chain = 'base';
          } else if (!seen.has(item.txHash)) {
            items.push(item);
          }
        }
        items.sort((a, b) => Number(b.timestamp || 0) - Number(a.timestamp || 0));
      } catch (err) {
        console.error('[history] base deposits:', err.message);
      }
    }
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

    const history = await chatStore.getChatHistory(userId);
    history.push({ role: 'user', content: message });
    history.push({ role: 'assistant', content: intent.message, intent });
    // No cap — Firestore document size limit (1MiB) is the only practical bound.
    await chatStore.setChatHistory(userId, history);

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
async function handleGetChatHistory(req, res) {
  const userId = getUserId(req);
  const history = await chatStore.getChatHistory(userId);
  return send(res, 200, { history });
}

// DELETE /chat
async function handleDeleteChat(req, res) {
  const userId = getUserId(req);
  await chatStore.deleteChatHistory(userId);
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

async function handleSwapQuote(req, res) {
  const { fromAsset, toAsset, amount, chain } = req.body || {};
  if (!amount) return send(res, 400, { error: 'Missing amount' });
  try {
    const quote = await require('./swap').quoteSwap({ chain, fromAsset, toAsset: toAsset || 'ETH', amount });
    const target = getChain(quote.chain || chain);
    return send(res, 200, {
      success: true,
      quote: { ...quote, chainId: target.chainId, decimals: target.stable.decimals },
    });
  } catch (err) {
    return send(res, 200, { success: false, reason: err.message });
  }
}

async function handleBridgeQuote(req, res) {
  try {
    const quote = await require('./bridge').quoteBridge(req.body || {});
    const from = getChain(quote.from);
    const to = getChain(quote.to);
    return send(res, 200, {
      success: true,
      quote: {
        ...quote,
        fromDomain: from.cctp.domain,
        toDomain: to.cctp.domain,
        tokenAddress: from.stable.address,
        tokenDecimals: from.stable.decimals,
        messenger: from.cctp.tokenMessenger,
        transmitter: to.cctp.messageTransmitter,
        fromChainId: from.chainId,
        toChainId: to.chainId,
      },
    });
  } catch (err) {
    return send(res, 200, { success: false, reason: err.message });
  }
}

// POST /swap — re-quotes, then vault-authorizes. Does not move funds if the
// vault or SwapExecutor for that chain is not deployed.
async function handleSwap(req, res) {
  const userId = getUserId(req);
  const { fromAsset, toAsset, amount, chain } = req.body || {};
  if (!amount) return send(res, 400, { error: 'Missing amount' });
  try {
    const wallet = await getOrCreateWallet(userId);
    const target = chain ? getChain(chain) : getChain();
    const signer = await ensureChainWallet(userId, target);
    const { executeSwap } = require('./swap');
    const result = await executeSwap({
      chain,
      fromAsset,
      toAsset: toAsset || 'ETH',
      amount,
      userAddress: signer.address,
    });
    return send(res, 200, result);
  } catch (err) {
    return send(res, 200, { success: false, executed: false, reason: err.message });
  }
}

async function handleBridge(req, res) {
  const userId = getUserId(req);
  const { from, to, amount } = req.body || {};
  if (!amount) return send(res, 400, { error: 'Missing amount' });
  try {
    await getOrCreateWallet(userId);
    const { executeBridge } = require('./bridge');
    const result = await executeBridge({ userId, from, to, amount });
    const source = getChain(result.quote.from);
    try {
      const { appendSpend } = require('./spendStore');
      await appendSpend({
        userAddress: userId,
        to: result.quote.to,
        amount: Number(result.quote.amount),
        reason: `${result.quote.fromName} to ${result.quote.toName}`,
        txHash: result.burnTx,
        token: 'USDC',
        type: 'bridge',
      });
    } catch (err) {
      console.error('[bridge] history:', err.message);
    }
    return send(res, 200, {
      ...result,
      explorer: txUrl(source, result.burnTx),
      mintExplorer: result.mintTx ? txUrl(getChain(result.quote.to), result.mintTx) : null,
    });
  } catch (err) {
    return send(res, 200, { success: false, status: 'failed', reason: err.message });
  }
}

async function handleBridgeComplete(req, res) {
  const userId = getUserId(req);
  try {
    const { completeBridge } = require('./bridge');
    const result = await completeBridge(userId);
    return send(res, 200, {
      ...result,
      explorer: txUrl(getChain(result.toChain), result.mintTx),
    });
  } catch (err) {
    return send(res, 200, { success: false, status: 'failed', reason: err.message });
  }
}

function handleChains(req, res) {
  return send(res, 200, {
    active: getChain().id,
    chains: listChains().map((c) => ({
      id: c.id,
      name: c.name,
      chainId: c.chainId,
      stable: c.stable.symbol,
      swap: !!(c.quoter && c.swapRouter),
      explorer: c.explorer,
    })),
  });
}

// GET /schedules
async function handleGetSchedules(req, res) {
  const userId = getUserId(req);
  const schedules = await getAllJobs(userId);
  return send(res, 200, { schedules });
}

// POST /schedules
async function handleCreateSchedule(req, res) {
  const userId = getUserId(req);
  const body = req.body || {};
  const { to, amount, interval, reason, trigger } = body;

  const intervalMs = parseInterval(interval);
  if (!intervalMs) return send(res, 400, { error: 'Invalid interval' });

  const wallet = await getOrCreateWallet(userId);
  // Key the job to the userId (browser address) for lookup, but execute payments
  // with the agent wallet address so vault balances/policies line up.
  const job = await addJob({ to, amount, reason, intervalMs, intervalLabel: interval, trigger, userAddress: userId, agentAddress: wallet.address });

  const { startJob } = require('./scheduler');
  await startJob(job, (to, amount, reason) => pay(wallet.walletId, to, amount, reason, wallet.address), userId);

  return send(res, 200, { success: true, schedule: job });
}

// DELETE /schedules/:id
async function handleDeleteSchedule(req, res, jobId) {
  const userId = getUserId(req);
  const job = await cancelJob(jobId, userId);
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
  const { amount, chain: chainName } = req.body || {};
  try {
    const chain = getChain(chainName || 'arc');
    if (chain.id === 'arc') {
      const wallet = await getOrCreateWallet(userId);
      const vaultAddress = await resolveOrCreateVault(userId);
      const txHash = await walletService.approveAndDepositToVault(wallet.walletId, vaultAddress, amount);
      const { appendSpend } = require('./spendStore');
      await appendSpend({ userAddress: userId, to: vaultAddress, amount: Number(amount), reason: 'Vault deposit', txHash, token: 'USDC', type: 'deposit' });
      return send(res, 200, { success: true, txHash, explorer: EXPLORER + txHash });
    }
    if (!chain.testnet) {
      return send(res, 200, { success: false, error: chain.name + ' is mainnet. Deposits stay on testnet. Nothing was moved.' });
    }
    if (chain.id === 'robinhood-testnet') {
      const { depositStock } = require('./robinhoodBalance');
      const { txHash, vaultAddress } = await depositStock(amount);
      const { appendSpend } = require('./spendStore');
      await appendSpend({
        userAddress: userId,
        to: vaultAddress,
        amount: Number(amount),
        reason: 'Robinhood testnet vault',
        txHash,
        token: 'USDG',
        type: 'deposit',
      });
      return send(res, 200, { success: true, txHash, explorer: chain.explorer + '/tx/' + txHash });
    }
    if (!chain.circle) {
      return send(res, 200, { success: false, error: chain.name + ' has no server wallet yet. Nothing was deposited.' });
    }
    const { vaultAddressFor } = require('./swap');
    const { ethers } = require('ethers');
    const vaultAddress = vaultAddressFor(chain);
    if (!vaultAddress) {
      return send(res, 200, { success: false, error: 'No vault on ' + chain.name + ' yet. Nothing was deposited.' });
    }
    const signer = await ensureChainWallet(userId, chain);
    const provider = getProvider(chain.id);
    const stable = new ethers.Contract(chain.stable.address, ['function balanceOf(address) view returns (uint256)'], provider);
    const amountRaw = ethers.parseUnits(String(amount), chain.stable.decimals);
    const balance = await stable.balanceOf(signer.address);
    if (balance < amountRaw) {
      return send(res, 200, {
        success: false,
        address: signer.address,
        error: 'Your ' + chain.name + ' wallet ' + signer.address + ' does not hold enough ' + chain.stable.symbol + '. Send test ' + chain.stable.symbol + ' there, then confirm again. Nothing was deposited.',
      });
    }
    const txHash = await walletService.depositOnChain({
      walletId: signer.walletId,
      blockchain: chain.circle,
      usdcAddress: chain.stable.address,
      vaultAddress,
      amountRaw: amountRaw.toString(),
    });
    const { appendSpend } = require('./spendStore');
    await appendSpend({
      userAddress: userId,
      to: vaultAddress,
      amount: Number(amount),
      reason: chain.name + ' vault',
      txHash,
      token: chain.stable.symbol,
      type: 'deposit',
    });
    let policySet = false;
    try {
      const vault = new ethers.Contract(vaultAddress, ['function getPolicy(address) view returns (tuple(uint256 perTxCap, uint256 dailyCap, uint256 maxTxPerHour, bool active) policy, address[] whitelist)'], provider);
      const result = await vault.getPolicy(signer.address);
      const policy = result.policy || result[0];
      const active = policy.active !== undefined ? policy.active : policy[3];
      if (!active) {
        const perTx = ethers.parseUnits('1000', chain.stable.decimals);
        const daily = ethers.parseUnits('5000', chain.stable.decimals);
        await walletService.setPolicyOnChain({
          walletId: signer.walletId,
          blockchain: chain.circle,
          vaultAddress,
          perTx: perTx.toString(),
          daily: daily.toString(),
          hourly: 20,
        });
        policySet = true;
      }
    } catch (err) {
      console.error('[deposit] policy setup failed:', err.message);
    }
    return send(res, 200, {
      success: true,
      txHash,
      explorer: chain.explorer + '/tx/' + txHash,
      address: signer.address,
      policySet,
    });
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
    const { appendSpend } = require('./spendStore');
    await appendSpend({ userAddress: userId, to: vaultAddress, amount: Number(amount), reason: 'Vault withdraw', txHash, token: 'USDC', type: 'withdrawal' });
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
      model: process.env.GROQ_MODEL || 'openai/gpt-oss-120b',
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



// ── Pools (contracts/PoolVault.sol) ─────────────────────────────────────────
// A pool is a shared-money group (roommates, small teams, trip funds) a user
// opts into creating — personal AgentVault usage is completely unaffected.
// Member-facing calls (create/accept/leave/contribute/withdraw/veto) are
// sent by the Privy wallet. This server returns the unsigned transaction,
// then records the result only after that wallet's receipt checks out.
// Shared spends, rule changes, and removals need a member EIP-712 signature,
// which this server relays and cannot create.

async function resolveInvite(raw) {
  if (typeof raw === 'string' && raw.startsWith('0x')) return raw;
  const tag = String(raw).replace('@', '').toLowerCase();
  const entry = await walletStore.findByTag(tag);
  if (!entry) throw new Error(`Could not resolve invite "${raw}" — not a known @tag or address`);
  return entry.address;
}

// POST /pools/parse — { description } -> a draft {name, invites, constitution}
// for the user to review before anything touches the chain. One sentence in,
// not a multi-field settings form.
async function handleParsePoolCreation(req, res) {
  const { description } = req.body || {};
  if (!description || !description.trim()) return send(res, 400, { error: 'description is required' });
  try {
    const poolBrain = require('./poolBrain');
    const draft = await poolBrain.parsePoolCreation(description.trim());
    return send(res, 200, draft);
  } catch (err) {
    return send(res, 500, { error: err.message });
  }
}

// POST /pools — { name, invites, constitution } prepares the transaction.
// The same body plus txHash records it after the Privy wallet has sent it.
async function handleCreatePool(req, res) {
  const userId = getUserId(req);
  const { name, invites = [], constitution, txHash } = req.body || {};
  if (!name || !constitution) return send(res, 400, { error: 'name and constitution are required' });
  try {
    const wallet = await getOrCreateWallet(userId);
    const poolVault = require('./poolVault');
    const resolvedInvites = await Promise.all(invites.map(resolveInvite));
    if (!txHash) {
      return send(res, 200, { needsSignature: true, tx: poolVault.createPoolCall(resolvedInvites, constitution) });
    }
    const created = await poolVault.readPoolCreated(sharedProvider, txHash, wallet.address);
    const poolStore = require('./poolStore');
    const existing = await poolStore.getPoolMeta(created.poolId);
    if (!existing) {
      await poolStore.createPoolMeta({ poolId: created.poolId, name, founderAddress: wallet.address, memberAddresses: [wallet.address, ...resolvedInvites] });
    }
    return send(res, 200, { poolId: created.poolId, txHash, name: existing?.name || name });
  } catch (err) {
    return send(res, 500, { error: err.message });
  }
}

// GET /pools/mine
async function handleListMyPools(req, res) {
  const userId = getUserId(req);
  try {
    const wallet = await getOrCreateWallet(userId);
    const poolStore = require('./poolStore');
    const metas = await poolStore.listPoolsForMember(wallet.address);
    const poolVault = require('./poolVault');
    const enriched = await Promise.all(metas.map(async (m) => {
      const onChain = await poolVault.getPool(sharedProvider, m.poolId).catch(() => null);
      const status = onChain ? await poolVault.getMemberStatus(sharedProvider, m.poolId, wallet.address) : 'None';
      return { ...m, onChain, myStatus: status };
    }));
    return send(res, 200, enriched);
  } catch (err) {
    return send(res, 500, { error: err.message });
  }
}

// GET /pools/:poolId
async function handleGetPool(req, res) {
  const userId = getUserId(req);
  try {
    const wallet = await getOrCreateWallet(userId);
    const poolVault = require('./poolVault');
    const poolStore = require('./poolStore');
    const [onChain, meta, myStatus] = await Promise.all([
      poolVault.getPool(sharedProvider, req.params.poolId),
      poolStore.getPoolMeta(req.params.poolId),
      poolVault.getMemberStatus(sharedProvider, req.params.poolId, wallet.address),
    ]);
    return send(res, 200, { ...onChain, name: meta?.name || null, poolId: req.params.poolId, myStatus });
  } catch (err) {
    return send(res, 500, { error: err.message });
  }
}

// POST /pools/:poolId/accept
async function handleAcceptPoolInvite(req, res) {
  const userId = getUserId(req);
  const { txHash } = req.body || {};
  try {
    const wallet = await getOrCreateWallet(userId);
    const poolVault = require('./poolVault');
    if (!txHash) return send(res, 200, { needsSignature: true, tx: poolVault.acceptInviteCall(req.params.poolId) });
    await poolVault.readMemberJoined(sharedProvider, txHash, wallet.address, req.params.poolId);
    const poolStore = require('./poolStore');
    await poolStore.addMemberToPoolMeta(req.params.poolId, wallet.address);
    return send(res, 200, { success: true, txHash });
  } catch (err) {
    return send(res, 500, { error: err.message });
  }
}

// POST /pools/:poolId/leave
async function handleLeavePool(req, res) {
  const userId = getUserId(req);
  const { txHash } = req.body || {};
  try {
    const wallet = await getOrCreateWallet(userId);
    const poolVault = require('./poolVault');
    if (!txHash) return send(res, 200, { needsSignature: true, tx: poolVault.leavePoolCall(req.params.poolId) });
    await poolVault.readMemberLeft(sharedProvider, txHash, wallet.address, req.params.poolId);
    return send(res, 200, { success: true, txHash });
  } catch (err) {
    return send(res, 500, { error: err.message });
  }
}

// POST /pools/:poolId/contribute — { amount, toShared, txHash? }
async function handleContributeToPool(req, res) {
  const userId = getUserId(req);
  const { amount, toShared, txHash } = req.body || {};
  if (!(Number(amount) > 0)) return send(res, 400, { error: 'amount must be positive' });
  try {
    const wallet = await getOrCreateWallet(userId);
    const poolVault = require('./poolVault');
    if (!txHash) {
      const calls = poolVault.contributeCalls(req.params.poolId, amount, toShared !== false);
      return send(res, 200, { needsSignature: true, approve: calls.approve, tx: calls.tx });
    }
    await poolVault.readContributed(sharedProvider, txHash, wallet.address, req.params.poolId, amount);
    const { appendSpend } = require('./spendStore');
    await appendSpend({ userAddress: wallet.address, to: `pool:${req.params.poolId}`, amount: Number(amount), reason: toShared !== false ? 'Pool contribution (shared)' : 'Pool contribution (personal)', txHash, token: 'USDC', type: 'pool_contribute' });
    return send(res, 200, { success: true, txHash });
  } catch (err) {
    return send(res, 500, { error: err.message });
  }
}

// POST /pools/:poolId/withdraw-personal — { amount, txHash? }
async function handleWithdrawPersonal(req, res) {
  const userId = getUserId(req);
  const { amount, txHash } = req.body || {};
  if (!(Number(amount) > 0)) return send(res, 400, { error: 'amount must be positive' });
  try {
    const wallet = await getOrCreateWallet(userId);
    const poolVault = require('./poolVault');
    if (!txHash) return send(res, 200, { needsSignature: true, tx: poolVault.withdrawPersonalCall(req.params.poolId, amount) });
    await poolVault.readWithdrawn(sharedProvider, txHash, wallet.address, req.params.poolId, amount);
    const { appendSpend } = require('./spendStore');
    await appendSpend({ userAddress: wallet.address, to: wallet.address, amount: Number(amount), reason: 'Personal allowance withdrawal', txHash, token: 'USDC', type: 'pool_withdraw_personal' });
    return send(res, 200, { success: true, txHash });
  } catch (err) {
    return send(res, 500, { error: err.message });
  }
}

function proposalDeadline() {
  return Math.floor(Date.now() / 1000) + 60 * 60;
}

// POST /pools/:poolId/propose-spend — { to, amount, reason, signature, deadline }
async function handleProposeSpend(req, res) {
  const userId = getUserId(req);
  const { to, amount, reason, signature, deadline } = req.body || {};
  if (!to || !(Number(amount) > 0)) return send(res, 400, { error: 'to and a positive amount are required' });
  try {
    const wallet = await getOrCreateWallet(userId);
    const poolVault = require('./poolVault');
    if (!signature || !deadline) {
      const typedData = await poolVault.spendTypedData(sharedProvider, {
        poolId: req.params.poolId, proposer: wallet.address, to, amount, reason: reason || '', deadline: proposalDeadline(),
      });
      return send(res, 400, { error: 'signature required', typedData });
    }
    const { proposalId, txHash } = await poolVault.proposeSpend(wallet.address, req.params.poolId, to, amount, reason || '', deadline, signature);
    const onChainProposal = await poolVault.getProposal(sharedProvider, proposalId);
    const poolStore = require('./poolStore');
    await poolStore.recordProposal({ proposalId, poolId: req.params.poolId, kind: 'Spend', windowEnds: onChainProposal.windowEnds, proposer: wallet.address });
    return send(res, 200, { proposalId, txHash, ...onChainProposal });
  } catch (err) {
    return send(res, 500, { error: err.message });
  }
}

// POST /pools/:poolId/propose-amend — { constitution }
async function handleProposeAmend(req, res) {
  const userId = getUserId(req);
  const { constitution, signature, deadline } = req.body || {};
  if (!constitution) return send(res, 400, { error: 'constitution is required' });
  try {
    const wallet = await getOrCreateWallet(userId);
    const poolVault = require('./poolVault');
    if (!signature || !deadline) {
      const typedData = await poolVault.amendTypedData(sharedProvider, {
        poolId: req.params.poolId, proposer: wallet.address, constitution, deadline: proposalDeadline(),
      });
      return send(res, 400, { error: 'signature required', typedData });
    }
    const { proposalId, txHash } = await poolVault.proposeAmendConstitution(wallet.address, req.params.poolId, constitution, deadline, signature);
    const onChainProposal = await poolVault.getProposal(sharedProvider, proposalId);
    const poolStore = require('./poolStore');
    await poolStore.recordProposal({ proposalId, poolId: req.params.poolId, kind: 'AmendConstitution', windowEnds: onChainProposal.windowEnds });
    return send(res, 200, { proposalId, txHash, ...onChainProposal });
  } catch (err) {
    return send(res, 500, { error: err.message });
  }
}

// POST /pools/:poolId/propose-remove — { targetMember: address|@tag }
async function handleProposeRemove(req, res) {
  const userId = getUserId(req);
  const { targetMember, signature, deadline } = req.body || {};
  if (!targetMember) return send(res, 400, { error: 'targetMember is required' });
  try {
    const wallet = await getOrCreateWallet(userId);
    const resolvedTarget = await resolveInvite(targetMember);
    const poolVault = require('./poolVault');
    if (!signature || !deadline) {
      const typedData = await poolVault.removeTypedData(sharedProvider, {
        poolId: req.params.poolId, proposer: wallet.address, targetMember: resolvedTarget, deadline: proposalDeadline(),
      });
      return send(res, 400, { error: 'signature required', typedData });
    }
    const { proposalId, txHash } = await poolVault.proposeRemoveMember(wallet.address, req.params.poolId, resolvedTarget, deadline, signature);
    const onChainProposal = await poolVault.getProposal(sharedProvider, proposalId);
    const poolStore = require('./poolStore');
    await poolStore.recordProposal({ proposalId, poolId: req.params.poolId, kind: 'RemoveMember', windowEnds: onChainProposal.windowEnds });
    return send(res, 200, { proposalId, txHash, ...onChainProposal });
  } catch (err) {
    return send(res, 500, { error: err.message });
  }
}

// GET /pools/:poolId/proposals
async function handleListPoolProposals(req, res) {
  try {
    const poolStore = require('./poolStore');
    const poolVault = require('./poolVault');
    const metas = await poolStore.listProposalsForPool(req.params.poolId);
    const enriched = await Promise.all(metas.map(async (m) => ({ ...m, onChain: await poolVault.getProposal(sharedProvider, m.proposalId).catch(() => null) })));
    return send(res, 200, enriched);
  } catch (err) {
    return send(res, 500, { error: err.message });
  }
}

// POST /proposals/:proposalId/veto
async function handleVetoProposal(req, res) {
  const userId = getUserId(req);
  try {
    const wallet = await getOrCreateWallet(userId);
    const poolVault = require('./poolVault');
    const { txHash } = req.body || {};
    if (!txHash) return send(res, 200, { needsSignature: true, tx: poolVault.vetoCall(req.params.proposalId) });
    await poolVault.readVeto(sharedProvider, txHash, wallet.address, req.params.proposalId);
    try {
      const poolStore = require('./poolStore');
      const proposal = await poolVault.getProposal(sharedProvider, req.params.proposalId);
      await poolStore.appendPoolMessage({ poolId: proposal.poolId, role: 'system', content: `🛑 ${wallet.address} objected — this proposal is blocked.`, proposalId: req.params.proposalId, messageType: 'system' });
    } catch (logErr) {
      console.error('[handleVetoProposal] failed to post system message:', logErr.message);
    }
    return send(res, 200, { success: true, txHash });
  } catch (err) {
    return send(res, 500, { error: err.message });
  }
}

// POST /pools/:poolId/chat — { message }. Group chat everyone in the pool
// sees. The AI here can only ever propose an action (contribute, propose_
// spend/amend/remove) — the actual money/governance move still goes through
// the exact same PoolVault calls (and on-chain enforcement) as the old
// form-based routes did. Objecting is deliberately NOT parsed from free
// text — src/poolBrain.js always redirects that to the explicit veto button.
async function handlePoolChatMessage(req, res) {
  const userId = getUserId(req);
  const { message } = req.body || {};
  if (!message || !message.trim()) return send(res, 400, { error: 'message is required' });
  const poolId = req.params.poolId;
  try {
    const wallet = await getOrCreateWallet(userId);
    const poolVault = require('./poolVault');
    const poolStore = require('./poolStore');
    const poolBrain = require('./poolBrain');

    const [pool, meta] = await Promise.all([poolVault.getPool(sharedProvider, poolId), poolStore.getPoolMeta(poolId)]);

    await poolStore.appendPoolMessage({ poolId, role: 'user', authorAddress: wallet.address, content: message.trim() });

    const intent = await poolBrain.parsePoolMessage(message.trim(), { name: meta?.name || `Pool #${poolId}`, memberList: pool.memberList, sharedBalance: pool.sharedBalance, constitution: pool.constitution });

    let replyContent = intent.message || '';
    let proposalId = null;
    let messageType = 'text';
    let signatureRequest = null;

    if (intent.action === 'contribute') {
      const calls = poolVault.contributeCalls(poolId, intent.amount, intent.toShared !== false);
      signatureRequest = { action: 'contribute', approve: calls.approve, tx: calls.tx, submit: { amount: intent.amount, toShared: intent.toShared !== false } };
      replyContent = replyContent || `Sign to contribute ${intent.amount} USDC. Nothing moves until you confirm.`;
    } else if (intent.action === 'propose_spend') {
      const to = await resolveInvite(intent.to);
      const typedData = await poolVault.spendTypedData(sharedProvider, {
        poolId, proposer: wallet.address, to, amount: intent.amount, reason: intent.reason || '', deadline: proposalDeadline(),
      });
      signatureRequest = { action: 'propose_spend', typedData, submit: { to, amount: intent.amount, reason: intent.reason || '' } };
      messageType = 'proposal';
      replyContent = replyContent || `Sign to propose ${intent.amount} USDC to ${to}. It waits out the objection window. Nothing is sent until you sign.`;
    } else if (intent.action === 'propose_amend') {
      const newConstitution = {
        discretionaryThreshold: intent.discretionaryThreshold ?? pool.constitution.discretionaryThreshold,
        objectionWindow: intent.objectionWindowHours != null ? Math.round(Number(intent.objectionWindowHours) * 3600) : pool.constitution.objectionWindow,
        maxSingleProposal: intent.maxSingleProposal ?? pool.constitution.maxSingleProposal,
      };
      const typedData = await poolVault.amendTypedData(sharedProvider, {
        poolId, proposer: wallet.address, constitution: newConstitution, deadline: proposalDeadline(),
      });
      signatureRequest = { action: 'propose_amend', typedData, submit: { constitution: newConstitution } };
      messageType = 'proposal';
      replyContent = replyContent || 'Sign to propose that rules change. Nothing is sent until you sign.';
    } else if (intent.action === 'propose_remove') {
      const targetMember = await resolveInvite(intent.targetMember);
      const typedData = await poolVault.removeTypedData(sharedProvider, {
        poolId, proposer: wallet.address, targetMember, deadline: proposalDeadline(),
      });
      signatureRequest = { action: 'propose_remove', typedData, submit: { targetMember } };
      messageType = 'proposal';
      replyContent = replyContent || `Sign to propose removing ${targetMember}. Nothing is sent until you sign.`;
    }

    const assistantMsg = await poolStore.appendPoolMessage({ poolId, role: 'assistant', content: replyContent, proposalId, messageType });
    return send(res, 200, { message: assistantMsg, signatureRequest });
  } catch (err) {
    try {
      const poolStore = require('./poolStore');
      await poolStore.appendPoolMessage({ poolId, role: 'assistant', content: `Couldn't do that: ${err.message}` });
    } catch { /* best-effort */ }
    return send(res, 500, { error: err.message });
  }
}

// GET /pools/:poolId/chat
async function handleGetPoolChat(req, res) {
  try {
    const poolStore = require('./poolStore');
    const messages = await poolStore.listPoolMessages(req.params.poolId, 200);
    return send(res, 200, messages);
  } catch (err) {
    return send(res, 500, { error: err.message });
  }
}

// POST /intent — state a goal; the intent solver decomposes it into a plan
// graph and starts executing what it can right away (see src/solver.js /
// src/intentEngine.js). Blocking steps (wait_for_condition, check_balance)
// are advanced on a timer — see index.js intentEngine.startTicker().
async function handleCreateIntent(req, res) {
  const userId = getUserId(req);
  const { goal } = req.body || {};
  if (!goal || typeof goal !== 'string') return send(res, 400, { error: '"goal" (string) is required' });
  try {
    const wallet = await getOrCreateWallet(userId);
    const intent = await require('./intentEngine').createIntent(goal, wallet.address, wallet.walletId);
    return send(res, 200, intent);
  } catch (err) {
    if (err.unresolvable) return send(res, 422, { error: err.message, unresolvable: true });
    return send(res, 500, { error: err.message });
  }
}

// GET /intent/:id — plan status: steps, cursor, per-step log, decision-log requestIds.
async function handleGetIntent(req, res) {
  try {
    const intent = await require('./intentEngine').getIntent(req.params.id);
    if (!intent) return send(res, 404, { error: 'Not found' });
    return send(res, 200, intent);
  } catch (err) {
    return send(res, 500, { error: err.message });
  }
}

// GET /intents — list this user's plans, most recent first.
async function handleListIntents(req, res) {
  const userId = getUserId(req);
  try {
    const wallet = await getOrCreateWallet(userId);
    const intents = await require('./intentEngine').listIntents(wallet.address);
    return send(res, 200, intents);
  } catch (err) {
    return send(res, 500, { error: err.message });
  }
}

// GET /decision-log/:requestId — on-chain decision provenance for a given
// requestId (see contracts/DecisionLog.sol). Public read, no auth needed
// beyond the global API key, since it only ever reveals a hash + summary
// that's already public on-chain.
async function handleGetDecision(req, res) {
  try {
    const decisionLog = require('./decisionLog');
    const decision = await decisionLog.getDecision(sharedProvider, req.params.requestId);
    return send(res, 200, decision);
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
    const base = await require('./baseBalance').readBasePosition(agentAddress).catch((err) => {
      console.error('[vault] base balance:', err.message);
      return null;
    });
    const vaultAddr = await escrow.findVault(agentAddress);
    let arcBalance = '0.0000';
    if (vaultAddr) {
      const onChain = await escrow.getOnChainPolicy(sharedProvider, agentAddress);
      arcBalance = String(onChain.vaultBalance);
    }
    let arcWallet = '0';
    try {
      const arcProvider = require('./chain').getProvider('arc');
      arcWallet = Number(require('ethers').formatEther(await arcProvider.getBalance(agentAddress))).toFixed(2);
    } catch (err) {
      console.error('[vault] arc balance:', err.message);
    }
    const chains = [
      ...(base ? [base] : []),
      { id: 'arc', name: 'Arc Testnet', token: 'USDC', vault: arcBalance, wallet: arcWallet, address: agentAddress, vaultAddress: vaultAddr },
    ];
    try {
      const hood = await require('./robinhoodBalance').readRobinhoodPosition(agentAddress);
      if (hood) chains.push(hood);
    } catch (err) {
      console.error('[vault] robinhood:', err.message);
    }
    return send(res, 200, {
      balance: base ? Number(base.vault).toFixed(4) : arcBalance,
      chain: base ? 'base' : 'arc',
      address: base ? base.vaultAddress : vaultAddr,
      agentAddress: base ? base.address : agentAddress,
      chains,
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
    const provider = sharedProvider;
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
    const provider = sharedProvider;
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
    const provider = sharedProvider;
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
    const { trackUser } = require('./spendStore');
    await trackUser(userId);
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
  const { appendSpend } = require('./spendStore');
  const body = req.body || {};
  try {
    await appendSpend({
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
  const provider = sharedProvider;
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
  console.log('[resolveOrCreateVault] userId=' + userId + ' agentAddress=' + agentAddress + ' vaultAddr=' + vaultAddr);

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
      abiFunctionSignature: 'createVault()',
      fee: { type: 'level', config: { feeLevel: 'MEDIUM' } }
    });

    let txState = tx.data?.state;
    const txId = tx.data?.id;
    for (let i = 0; i < 30 && txState !== 'COMPLETE'; i++) {
      await new Promise(r => setTimeout(r, 2000));
      const status = await client.getTransaction({ id: txId });
      txState = status.data?.transaction?.state;
      if (txState === 'FAILED') {
        console.error('Vault creation FAILED, full transaction object:', JSON.stringify(status.data?.transaction, null, 2));
        throw new Error('Vault creation transaction failed: ' + (status.data?.transaction?.errorReason || status.data?.transaction?.errorDetails || 'unknown reason'));
      }
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
app.post('/swap/quote', handleSwapQuote);
app.post('/bridge/quote', handleBridgeQuote);
app.post('/swap', handleSwap);
app.post('/bridge', handleBridge);
app.post('/bridge/complete', handleBridgeComplete);
async function handleTransfer(req, res) {
  const userId = getUserId(req);
  const { asset, amount, to } = req.body || {};
  if (!asset || !amount || !to) return send(res, 400, { error: 'asset, amount, and to are required' });
  try {
    const result = await require('./transfer').sendOnRobinhood({ asset, amount, to });
    const { appendSpend } = require('./spendStore');
    try {
      await appendSpend({
        userAddress: userId,
        to,
        amount: Number(amount),
        reason: 'Robinhood ' + result.token,
        txHash: result.txHash,
        token: result.token,
        type: 'payment',
      });
    } catch (err) {
      console.error('[transfer] history:', err.message);
    }
    return send(res, 200, { success: true, ...result });
  } catch (err) {
    return send(res, 200, { success: false, reason: err.shortMessage || err.message });
  }
}

app.post('/transfer', handleTransfer);
async function handleMintUsdg(req, res) {
  const userId = getUserId(req);
  const amount = Number((req.body || {}).amount || 1000);
  try {
    const result = await require('./transfer').mintTestUsdg(amount);
    const { appendSpend } = require('./spendStore');
    try {
      await appendSpend({
        userAddress: userId,
        to: 'robinhood-testnet',
        amount,
        reason: 'Mint test USDG',
        txHash: result.txHash,
        token: 'USDG',
        type: 'deposit',
      });
    } catch (err) {
      console.error('[usdg] history:', err.message);
    }
    return send(res, 200, { success: true, ...result });
  } catch (err) {
    return send(res, 200, { success: false, reason: err.shortMessage || err.message });
  }
}

app.post('/usdg/mint', handleMintUsdg);
async function handleFundTest(req, res) {
  const userId = getUserId(req);
  try {
    const result = await require('./transfer').fundTestWallet();
    if (result.txHash) {
      const { appendSpend } = require('./spendStore');
      try {
        await appendSpend({
          userAddress: userId,
          to: 'robinhood-testnet',
          amount: 100,
          reason: 'Fund test wallet',
          txHash: result.txHash,
          token: 'USDG',
          type: 'deposit',
        });
      } catch (err) {
        console.error('[fund] history:', err.message);
      }
    }
    return send(res, 200, { success: result.deposited === true, ...result });
  } catch (err) {
    return send(res, 200, { success: false, reason: err.shortMessage || err.message });
  }
}

app.post('/test/fund', handleFundTest);
async function handleClaimTest(req, res) {
  const userId = getUserId(req);
  try {
    const wallet = await walletStore.getWallet(userId);
    if (!wallet || !wallet.address) {
      return send(res, 200, { success: false, reason: 'Sign in again so the wallet exists.' });
    }
    const previous = (wallet.testClaim && wallet.testClaim.landed) || [];
    const result = await require('./testClaim').claimTestnet(wallet.address, previous);
    const landed = previous.concat(result.landed);
    if (!result.landed.length) {
      return send(res, 200, { success: true, already: true, landed, skipped: result.skipped });
    }
    const saved = { landed, skipped: result.skipped };
    await walletStore.setWallet(userId, { testClaim: saved });
    return send(res, 200, { success: true, ...saved });
  } catch (err) {
    return send(res, 200, { success: false, reason: err.shortMessage || err.message });
  }
}

app.post('/test/claim', handleClaimTest);
app.get('/chains', handleChains);
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
app.post('/intent', handleCreateIntent);
app.get('/intent/:id', handleGetIntent);
app.get('/intents', handleListIntents);
app.get('/decision-log/:requestId', handleGetDecision);

app.post('/pools/parse', handleParsePoolCreation);
app.post('/pools', handleCreatePool);
app.get('/pools/mine', handleListMyPools);
app.get('/pools/:poolId', handleGetPool);
app.post('/pools/:poolId/accept', handleAcceptPoolInvite);
app.post('/pools/:poolId/leave', handleLeavePool);
app.post('/pools/:poolId/contribute', handleContributeToPool);
app.post('/pools/:poolId/withdraw-personal', handleWithdrawPersonal);
app.post('/pools/:poolId/propose-spend', handleProposeSpend);
app.post('/pools/:poolId/propose-amend', handleProposeAmend);
app.post('/pools/:poolId/propose-remove', handleProposeRemove);
app.get('/pools/:poolId/proposals', handleListPoolProposals);
app.post('/proposals/:proposalId/veto', handleVetoProposal);
app.post('/pools/:poolId/chat', handlePoolChatMessage);
app.get('/pools/:poolId/chat', handleGetPoolChat);
app.post('/intelligence', gateway.require('$0.001'), handleIntelligence);
async function handleScheduleStats(req, res) {
  try {
    const userId = getUserId(req);
    const stats = await require('./spendStore').getScheduleStats(userId);
    return send(res, 200, stats);
  } catch (err) {
    return send(res, 500, { error: err.message });
  }
}
app.get('/schedules/stats', handleScheduleStats);

const { setupRoutes } = require('./api/serverRoutes');
setupRoutes(app);

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

// Boot: deploy the Base vault once if the server key has gas.
// Retries every 10 minutes until it deploys or is disabled.
require('./bootstrapBase').watchBase();
require('./bootstrapRobinhood').watchRobinhood();
require('./bridge').watchBridges();

// Boot: restart timers for all active scheduled jobs
(async () => {
  try {
    const { getActiveJobs, startJob } = require('./scheduler');
    const activeJobs = await getActiveJobs();
    if (activeJobs.length) {
      console.log('⏰ Restarting ' + activeJobs.length + ' active scheduled job(s)...');
      for (const job of activeJobs) {
        const wallet = await getOrCreateWallet(job.userAddress);
        await startJob(job, (to, amount, reason) => pay(wallet.walletId, to, amount, reason, wallet.address), job.userAddress);
      }
    }
  } catch (err) {
    console.error('Boot scheduler error:', err.message);
  }
})();

// Keeper: execute on-chain schedules when nextRun has passed
(async () => {
  async function runKeeper() {
    try {
      const { getActiveUsers, appendSpend, appendFailure } = require('./spendStore');
      const users = await getActiveUsers();
      console.log('[Keeper] checking ' + users.length + ' users:', users);
      for (const userAddress of users) {
        try {
          const wallet = await getOrCreateWallet(userAddress);
          const provider = sharedProvider;
          const vaultAddr = await resolveOrCreateVault(userAddress);
          console.log('[Keeper] user=' + userAddress + ' vault=' + vaultAddr);
          if (!vaultAddr) { console.log('[Keeper] no vault, skipping'); continue; }
          const schedules = await escrow.getOnChainSchedules(provider, wallet.address);
          for (const s of schedules) {
            if (!s.active) continue;
            if (new Date() < new Date(s.nextRun)) continue;
            console.log('⏰ Keeper executing on-chain schedule ' + s.id + ' for ' + userAddress);
            try {
              const agentWalletId = process.env.AGENT_WALLET_ID || wallet.walletId;
              console.log('[Keeper] executing with agentWalletId=' + agentWalletId + ' vault=' + vaultAddr + ' user=' + wallet.address + ' index=' + s.id);
              const txHash = await walletService.executeOnChainSchedule(agentWalletId, vaultAddr, wallet.address, s.id);
              await appendSpend({
                userAddress: userAddress,
                to: s.to,
                amount: s.amount,
                reason: s.reason,
                txHash,
                isScheduled: true,
                scheduleId: s.id,
                type: 'payment'
              });
              console.log('✅ On-chain schedule ' + s.id + ' executed');
            } catch (err) {
              console.error('❌ Schedule ' + s.id + ' failed:', err.message);
              try {
                await appendFailure({
                  userAddress: userAddress,
                  to: s.to,
                  amount: s.amount,
                  reason: s.reason,
                  blockedReason: err.message,
                  scheduleId: s.id
                });
              } catch (logErr) {
                console.error('❌ Failed to log schedule failure:', logErr.message);
              }
            }
          }
        } catch (err) {
          console.error('Keeper user error:', err.message);
        }
      }
    } catch (err) {
      console.error('Keeper error:', err.message);
    }
  }
  setInterval(runKeeper, 60000);
  console.log('⏰ On-chain schedule keeper started (60s interval)');
})();

// Sign-in stores the user's own EVM address. Circle is not asked for a wallet.
app.post('/api/auth/login', async (req, res) => {
  try {
    const { uid, email, displayName, address } = req.body;
    if (!uid) return res.status(400).json({ error: 'uid required' });

    let wallet = await walletStore.getWallet(uid);

    if (!wallet) {
      const { ethers } = require('ethers');
      if (!address || !ethers.isAddress(address)) {
        return res.status(200).json({ wallet: null });
      }
      wallet = {
        walletId: null,
        address: ethers.getAddress(address),
        provider: 'privy',
        email,
        displayName,
        tag: null,
        createdAt: new Date().toISOString()
      };
      await walletStore.setWallet(uid, wallet);
      console.log('New user wallet saved:', uid, wallet.address);
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
    const { getHistory } = require('./spendStore');

    Promise.all([
      walletStore.getAllWallets(),
      getHistory(null, 5000)
    ]).then(([wallets, history]) => {
      const realTx = history.filter(tx => !tx.failed && tx.txHash);
      const totalVolume = realTx.reduce((sum, tx) => sum + parseFloat(tx.amount || 0), 0);
      const userCount = Object.keys(wallets).length;
      const txCount = realTx.length;
      const activeScheduleIds = new Set(
        realTx.filter(tx => tx.scheduleId).map(tx => tx.scheduleId)
      );

      res.json({
        users: userCount,
        transactions: txCount,
        volume: totalVolume.toFixed(2),
        schedules: activeScheduleIds.size
      });
    }).catch(err => {
      res.status(500).json({ error: err.message });
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});



const http = require('http');
const { pay, prepareSwap, confirmSwap, getSummary, chatOnChain, getUnifiedHistory, executeIntent, getVaultBalance, setupEscrowPolicy } = require('./agent');
const { readPolicy, applyUpdate } = require('./policyManager');
const { getTodaySpend, getHistory } = require('../utils/store');
const { getAllJobs, addJob, cancelJob, parseInterval, intervalLabel } = require('./scheduler');
const { getVaultContract, findVault } = require('./escrow');

const PORT = process.env.PORT || 3000;

let backendWallet = null;

// ── In-memory store ───────────────────────────────────────────────────────────
const requestStore = new Map();
const chatHistories = new Map();

// ── Helpers ───────────────────────────────────────────────────────────────────
function send(res, status, data) {
  const body = JSON.stringify(data, null, 2);
  res.writeHead(status, {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'x-api-key, Content-Type, x-user-address',
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

// ── Route handlers ────────────────────────────────────────────────────────────

// GET /health
function handleHealth(req, res) {
  return send(res, 200, {
    status:  'ok',
    agent:   'AgentPay',
    version: '2.0',
    address: process.env.WALLET_ADDRESS || '',
    time:    new Date().toISOString()
  });
}

// GET /policy
async function handleGetPolicy(req, res) {
  const userAddress = req.headers['x-user-address'];
  const summary = await getSummary(userAddress);
  if (summary) {
    return send(res, 200, {
      perTxCap:        summary.perTxCapSTT,
      dailyCap:        summary.dailyCapSTT,
      dailySpendSoFar: parseFloat(summary.todaySpent.toFixed(4)),
      dailyRemaining:  parseFloat(summary.dailyRemaining.toFixed(4)),
      whitelist:       summary.whitelist,
      activeHours:     summary.activeHours,
      circuitBreaker:  { maxTxPerHour: summary.maxTxPerHour },
      source:          summary.source
    });
  }

  const policy     = readPolicy();
  const todaySpend = getTodaySpend();
  return send(res, 200, {
    perTxCap:        policy.perTxCapSTT,
    dailyCap:        policy.dailyCapSTT,
    dailySpendSoFar: parseFloat(todaySpend.toFixed(4)),
    dailyRemaining:  parseFloat((policy.dailyCapSTT - todaySpend).toFixed(4)),
    whitelist:       policy.allowedRecipients,
    activeHours:     policy.activeHours,
    circuitBreaker:  policy.circuitBreaker,
    source:          'local'
  });
}

// POST /policy
async function handleUpdatePolicy(req, res) {
  const userAddress = req.headers['x-user-address'];
  const body = await parseBody(req);
  const updated = applyUpdate(body);
  await setupEscrowPolicy(userAddress);
  return send(res, 200, updated);
}

// GET /agents
function handleAgents(req, res) {
  return send(res, 200, {
    agents: [{
      agentId:     'agentpay_001',
      name:        'AgentPay',
      description: 'Autonomous payment agent on Somnia blockchain',
      wallet:      process.env.WALLET_ADDRESS || '',
      reputation:  { total: 0, approved: 0, rejected: 0, score: 100 }
    }],
    total: 1
  });
}

// GET /history
async function handleHistory(req, res) {
  const userAddress = req.headers['x-user-address'];
  try {
    const items = await getUnifiedHistory(userAddress, 50);
    return send(res, 200, { items, total: items.length });
  } catch (err) {
    return send(res, 500, { error: 'History fetch failed: ' + err.message });
  }
}

// POST /chat
async function handleChat(req, res) {
  const userAddress = req.headers['x-user-address'] || 'anonymous';
  const body = await parseBody(req);
  const { message, vaultBalance, verifiable } = body;

  if (!message) return send(res, 400, { error: 'Missing message' });

  try {
    const history = chatHistories.get(userAddress) || [];
    console.log('🛡️  Somnia Verifiable AI...');
    let resolvedVaultBalance = vaultBalance;
    if (resolvedVaultBalance === undefined) {
      try { resolvedVaultBalance = await getVaultBalance(); } catch(e) { console.error("getVaultBalance error:", e.message); }
    }
    const intent = await chatOnChain(message, resolvedVaultBalance, userAddress);
    history.push({ role: 'user', content: message });
    history.push({ role: 'assistant', content: intent.message, intent });
    
    if (history.length > 20) history.splice(0, 2);
    chatHistories.set(userAddress, history);

    return send(res, 200, {
      message: intent.message,
      action:  intent.action,
      intent,
      verifiable: !!intent.requestId
    });
  } catch (err) {
    return send(res, 500, { error: 'Brain error: ' + err.message });
  }
}

// GET /chat (history)
function handleGetChatHistory(req, res) {
  const userAddress = req.headers['x-user-address'] || 'anonymous';
  const history = chatHistories.get(userAddress) || [];
  return send(res, 200, { history });
}

// DELETE /chat
function handleDeleteChat(req, res) {
  const userAddress = req.headers['x-user-address'] || 'anonymous';
  chatHistories.delete(userAddress);
  return send(res, 200, { success: true });
}

// POST /pay
async function handlePay(req, res) {
  const userAddress = req.headers['x-user-address'];
  const body = await parseBody(req);
  const { to, amount, reason, requestId, fromToken } = body;

  if (!to || !amount || !requestId) {
    return send(res, 400, { error: 'Missing required fields: to, amount, requestId' });
  }

  if (requestStore.has(requestId)) {
    const existing = requestStore.get(requestId);
    return send(res, 200, { requestId, status: existing.status, message: 'Already processed' });
  }

  const record = {
    status:    'pending',
    to,
    amount:    parseFloat(amount),
    token:     fromToken || 'STT',
    reason:    reason || 'No reason provided',
    txHash:    null,
    error:     null,
    timestamp: new Date().toISOString()
  };
  requestStore.set(requestId, record);

  const result = await pay(to, parseFloat(amount), reason || 'API payment', fromToken, userAddress);

  if (result.success) {
    record.status = 'executed';
    record.txHash = result.txHash;
    return send(res, 200, {
      requestId,
      status:    'executed',
      txHash:    result.txHash,
      to,
      amount:    parseFloat(amount),
      explorer:  'https://explorer.somnia.network/tx/' + result.txHash,
      timestamp: record.timestamp
    });
  } else {
    record.status = 'rejected';
    record.error  = result.reason;
    return send(res, 200, {
      requestId,
      status:    'rejected',
      reason:    result.reason,
      timestamp: record.timestamp
    });
  }
}

// POST /swap
async function handleSwap(req, res) {
  const body = await parseBody(req);
  const { fromToken, toToken, amount, execute } = body;

  if (!fromToken || !toToken || !amount) {
    return send(res, 400, { error: 'Missing swap parameters' });
  }

  if (execute) {
    const result = await confirmSwap(fromToken, toToken, amount);
    return send(res, 200, result);
  } else {
    const result = await prepareSwap(fromToken, toToken, amount);
    return send(res, 200, result);
  }
}

// GET /schedules
function handleGetSchedules(req, res) {
  const userAddress = req.headers['x-user-address'];
  const jobs = getAllJobs(userAddress);
  return send(res, 200, { schedules: jobs });
}

// POST /schedules
async function handleCreateSchedule(req, res) {
  const userAddress = req.headers['x-user-address'];
  const body = await parseBody(req);
  const { to, amount, interval, reason, conditions } = body;
  
  const intervalMs = parseInterval(interval);
  if (!intervalMs) return send(res, 400, { error: 'Invalid interval' });

  const job = addJob({
    to,
    amount,
    reason,
    intervalMs,
    intervalLabel: interval,
    conditions,
    userAddress
  });

  return send(res, 200, { success: true, schedule: job });
}

// DELETE /schedules/:id
function handleDeleteSchedule(req, res, jobId) {
  const userAddress = req.headers['x-user-address'];
  const job = cancelJob(jobId, userAddress);
  if (!job) return send(res, 404, { error: 'Job not found or unauthorized' });
  return send(res, 200, { success: true });
}

// GET /status/:requestId
function handleStatus(req, res, requestId) {
  if (!requestId) return send(res, 400, { error: 'Missing requestId' });
  const record = requestStore.get(requestId);
  if (!record) return send(res, 404, { error: 'Request not found' });
  return send(res, 200, { requestId, ...record });
}

// GET /vault-address
async function handleVaultCheck(req, res) {
  const userAddress = req.headers['x-user-address'];
  if (!userAddress) return send(res, 400, { error: 'Missing user address' });
  try {
    const address = await findVault(userAddress);
    return send(res, 200, { exists: !!address, address });
  } catch (err) {
    return send(res, 500, { error: err.message });
  }
}

async function handleGetVaultAddress(req, res) {
  const userAddress = req.headers['x-user-address'];
  if (!userAddress) return send(res, 400, { error: 'Missing user address' });
  try {
    if (process.env.VAULT_ADDRESS) return send(res, 200, { address: process.env.VAULT_ADDRESS });
    const contract = await getVaultContract(backendWallet, userAddress);
    const address = await contract.getAddress();
    return send(res, 200, { address });
  } catch (err) {
    return send(res, 500, { error: err.message });
  }
}

async function handleIntent(req, res) {
  const userAddress = req.headers['x-user-address'];
  const body = await parseBody(req);
  const { intentName, amount, to, reason } = body;

  if (!intentName || !amount) {
    return send(res, 400, { error: 'Missing intentName or amount' });
  }

  try {
    const result = await executeIntent(intentName, amount, to, reason, userAddress);
    return send(res, 200, result);
  } catch (err) {
    return send(res, 500, { error: err.message });
  }
}

// ── Main router ───────────────────────────────────────────────────────────────
const server = http.createServer(async (req, res) => {
  const url    = req.url.split('?')[0];
  const method = req.method;

  if (method === 'OPTIONS') return send(res, 204, {});

  if (method === 'GET'  && url === '/health')          return handleHealth(req, res);
  if (method === 'GET'  && url === '/vault-check')     return await handleVaultCheck(req, res);
  if (method === 'GET'  && url === '/vault-address')   return await handleGetVaultAddress(req, res);
  if (method === 'GET'  && url === '/policy')          return await handleGetPolicy(req, res);
  if (method === 'POST' && url === '/policy')          return await handleUpdatePolicy(req, res);
  if (method === 'GET'  && url === '/agents')          return handleAgents(req, res);
  if (method === 'GET'  && url === '/history')         return await handleHistory(req, res);
  if (method === 'POST' && url === '/chat')            return await handleChat(req, res);
  if (method === 'GET'  && url === '/chat')            return handleGetChatHistory(req, res);
  if (method === 'DELETE' && url === '/chat')          return handleDeleteChat(req, res);
  if (method === 'POST' && url === '/pay')             return await handlePay(req, res);
  if (method === 'POST' && url === '/swap')            return await handleSwap(req, res);
  if (method === 'POST' && url === '/intent')          return await handleIntent(req, res);
  if (method === 'GET'  && url === '/schedules')       return handleGetSchedules(req, res);
  if (method === 'POST' && url === '/schedules')       return await handleCreateSchedule(req, res);
  if (method === 'DELETE' && url.startsWith('/schedules/')) return handleDeleteSchedule(req, res, url.replace('/schedules/', ''));
  if (method === 'GET'  && url.startsWith('/status/')) return handleStatus(req, res, url.replace('/status/', ''));

  return send(res, 404, { error: 'Not found' });
});

function startServer(wallet) {
  backendWallet = wallet;
  return new Promise((resolve) => {
    server.listen(PORT, () => {
      console.log('🌐 AgentPay API running on http://localhost:' + PORT);
      resolve();
    });
  });
}

module.exports = { startServer };

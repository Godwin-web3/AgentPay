const http = require('http');
const { pay } = require('./agent');
const { readPolicy, applyUpdate } = require('./policyManager');
const { getTodaySpend, getHistory } = require('../utils/store');
const { parseIntent } = require('./brain');

const PORT = process.env.PORT || 3000;

// ── In-memory store ───────────────────────────────────────────────────────────
const requestStore = new Map();

// ── Helpers ───────────────────────────────────────────────────────────────────
function send(res, status, data) {
  const body = JSON.stringify(data, null, 2);
  res.writeHead(status, {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'x-api-key, Content-Type',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS'
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
    time:    new Date().toISOString()
  });
}

// GET /policy
function handleGetPolicy(req, res) {
  const policy     = readPolicy();
  const todaySpend = getTodaySpend();
  return send(res, 200, {
    perTxCap:        policy.perTxCapSTT,
    dailyCap:        policy.dailyCapSTT,
    dailySpendSoFar: parseFloat(todaySpend.toFixed(4)),
    dailyRemaining:  parseFloat((policy.dailyCapSTT - todaySpend).toFixed(4)),
    whitelist:       policy.allowedRecipients,
    activeHours:     policy.activeHours,
    circuitBreaker:  policy.circuitBreaker
  });
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
function handleHistory(req, res) {
  const logs = getHistory(20);
  return send(res, 200, { logs, total: logs.length });
}

// POST /chat
async function handleChat(req, res) {
  const body = await parseBody(req);
  const { message, conversationHistory } = body;

  if (!message) return send(res, 400, { error: 'Missing message' });

  try {
    const intent = await parseIntent(message);
    return send(res, 200, {
      message: intent.message,
      action:  intent.action,
      intent
    });
  } catch (err) {
    return send(res, 500, { error: 'Brain error: ' + err.message });
  }
}

// POST /pay
async function handlePay(req, res) {
  const body = await parseBody(req);
  const { to, amount, reason, requestId } = body;

  if (!to || !amount || !requestId) {
    return send(res, 400, { error: 'Missing required fields: to, amount, requestId' });
  }

  // Prevent duplicate requests
  if (requestStore.has(requestId)) {
    const existing = requestStore.get(requestId);
    return send(res, 200, { requestId, status: existing.status, message: 'Already processed' });
  }

  const record = {
    status:    'pending',
    to,
    amount:    parseFloat(amount),
    reason:    reason || 'No reason provided',
    txHash:    null,
    error:     null,
    timestamp: new Date().toISOString()
  };
  requestStore.set(requestId, record);

  const result = await pay(to, parseFloat(amount), reason || 'API payment');

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

// GET /status/:requestId
function handleStatus(req, res, requestId) {
  if (!requestId) return send(res, 400, { error: 'Missing requestId' });
  const record = requestStore.get(requestId);
  if (!record) return send(res, 404, { error: 'Request not found' });
  return send(res, 200, { requestId, ...record });
}

// ── Main router ───────────────────────────────────────────────────────────────
const server = http.createServer(async (req, res) => {
  const url    = req.url.split('?')[0];
  const method = req.method;

  if (method === 'OPTIONS') return send(res, 204, {});

  if (method === 'GET'  && url === '/health')          return handleHealth(req, res);
  if (method === 'GET'  && url === '/policy')          return handleGetPolicy(req, res);
  if (method === 'POST' && url === '/policy')          return await handleUpdatePolicy(req, res);
  if (method === 'GET'  && url === '/agents')          return handleAgents(req, res);
  if (method === 'GET'  && url === '/history')         return handleHistory(req, res);
  if (method === 'POST' && url === '/chat')            return await handleChat(req, res);
  if (method === 'POST' && url === '/pay')             return await handlePay(req, res);
  if (method === 'GET'  && url.startsWith('/status/')) return handleStatus(req, res, url.replace('/status/', ''));

  return send(res, 404, { error: 'Not found' });
});

function startServer() {
  return new Promise((resolve) => {
    server.listen(PORT, () => {
      console.log('🌐 AgentPay API running on http://localhost:' + PORT);
      console.log('   GET  /health            — health check');
      console.log('   GET  /policy            — spending rules');
      console.log('   POST /policy            — update policy');
      console.log('   GET  /agents            — agent directory');
      console.log('   GET  /history           — recent activity');
      console.log('   POST /chat              — chat with AI brain');
      console.log('   POST /pay               — submit payment');
      console.log('   GET  /status/:id        — check request');
      resolve();
    });
  });
}

module.exports = { startServer };

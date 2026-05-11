// src/server.js
const http = require('http');
const { pay } = require('./agent');
const { readPolicy } = require('./policyManager');
const { getTodaySpend, getHistory } = require('../utils/store');

const PORT = process.env.PORT || 3000;

// ── In-memory stores ──────────────────────────────────────────────────────────
const agentRegistry = new Map();
const requestStore  = new Map();

// ── Default test agent ────────────────────────────────────────────────────────
agentRegistry.set('agent_test_001', {
  apiKey:      'ak_test_agentpay_2024',
  name:        'TestAgent',
  description: 'Default test agent',
  reputation:  { total: 0, approved: 0, rejected: 0, score: 100 }
});

// ── Helpers ───────────────────────────────────────────────────────────────────
function send(res, status, data) {
  const body = JSON.stringify(data, null, 2);
  res.writeHead(status, {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*'
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

function authenticate(headers) {
  const apiKey = headers['x-api-key'];
  if (!apiKey) return null;
  for (const [agentId, agent] of agentRegistry.entries()) {
    if (agent.apiKey === apiKey) return { agentId, agent };
  }
  return null;
}

function updateScore(agent) {
  if (agent.reputation.total === 0) return;
  agent.reputation.score = Math.round(
    (agent.reputation.approved / agent.reputation.total) * 100
  );
}

// ── Route handlers ────────────────────────────────────────────────────────────

// POST /pay
async function handlePay(req, res) {
  const auth = authenticate(req.headers);
  if (!auth) return send(res, 401, { error: 'Invalid or missing x-api-key' });

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

  // Store as pending
  const record = {
    status:    'pending',
    agentId:   auth.agentId,
    to,
    amount:    parseFloat(amount),
    reason:    reason || 'No reason provided',
    txHash:    null,
    error:     null,
    timestamp: new Date().toISOString()
  };
  requestStore.set(requestId, record);
  auth.agent.reputation.total++;

  // Execute via existing pay() — policy check + transfer + logging all handled
  const result = await pay(to, parseFloat(amount), reason || 'API payment');

  if (result.success) {
    record.status = 'executed';
    record.txHash = result.txHash;
    auth.agent.reputation.approved++;
    updateScore(auth.agent);

    return send(res, 200, {
      requestId,
      status:    'executed',
      txHash:    result.txHash,
      agentId:   auth.agentId,
      to,
      amount:    parseFloat(amount),
      explorer:  'https://explorer.somnia.network/tx/' + result.txHash,
      timestamp: record.timestamp
    });
  } else {
    record.status = 'rejected';
    record.error  = result.reason;
    auth.agent.reputation.rejected++;
    updateScore(auth.agent);

    return send(res, 200, {
      requestId,
      status:    'rejected',
      reason:    result.reason,
      agentId:   auth.agentId,
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

// GET /policy
function handlePolicy(req, res) {
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
  const agents = [];
  for (const [agentId, data] of agentRegistry.entries()) {
    agents.push({
      agentId,
      name:        data.name,
      description: data.description,
      reputation:  data.reputation
    });
  }
  return send(res, 200, { agents, total: agents.length });
}

// POST /agents/register
async function handleRegister(req, res) {
  const body = await parseBody(req);
  const { name, description } = body;

  if (!name) return send(res, 400, { error: 'Missing required field: name' });

  const agentId = 'agent_' + Date.now() + '_' + Math.random().toString(36).slice(2, 7);
  const apiKey  = 'ak_' + Math.random().toString(36).slice(2) + Math.random().toString(36).slice(2);

  agentRegistry.set(agentId, {
    apiKey,
    name,
    description: description || '',
    reputation:  { total: 0, approved: 0, rejected: 0, score: 100 }
  });

  return send(res, 201, {
    agentId,
    apiKey,
    message: 'Agent registered. Save your apiKey — it will not be shown again.'
  });
}

// GET /history
function handleHistory(req, res) {
  const auth = authenticate(req.headers);
  if (!auth) return send(res, 401, { error: 'Invalid or missing x-api-key' });

  const logs = getHistory(20);
  return send(res, 200, { logs, total: logs.length });
}

// GET /health
function handleHealth(req, res) {
  return send(res, 200, {
    status:  'ok',
    agent:   'AgentPay',
    version: '2.0',
    time:    new Date().toISOString()
  });
}

// ── Main router ───────────────────────────────────────────────────────────────
const server = http.createServer(async (req, res) => {
  const url    = req.url;
  const method = req.method;

  // CORS preflight
  if (method === 'OPTIONS') {
    res.writeHead(204, { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'x-api-key, Content-Type' });
    return res.end();
  }

  if (method === 'POST' && url === '/pay')               return await handlePay(req, res);
  if (method === 'GET'  && url.startsWith('/status/'))   return handleStatus(req, res, url.replace('/status/', ''));
  if (method === 'GET'  && url === '/policy')            return handlePolicy(req, res);
  if (method === 'GET'  && url === '/agents')            return handleAgents(req, res);
  if (method === 'POST' && url === '/agents/register')   return await handleRegister(req, res);
  if (method === 'GET'  && url === '/history')           return handleHistory(req, res);
  if (method === 'GET'  && url === '/health')            return handleHealth(req, res);

  return send(res, 404, { error: 'Not found' });
});

function startServer() {
  return new Promise((resolve) => {
    server.listen(PORT, () => {
      console.log('🌐 AgentPay API running on http://localhost:' + PORT);
      console.log('   POST /pay               — submit payment');
      console.log('   GET  /status/:id        — check request');
      console.log('   GET  /policy            — spending rules');
      console.log('   GET  /agents            — agent directory');
      console.log('   POST /agents/register   — register agent');
      console.log('   GET  /history           — recent activity');
      console.log('   GET  /health            — health check');
      resolve();
    });
  });
}

module.exports = { startServer };

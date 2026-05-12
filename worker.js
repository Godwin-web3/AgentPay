// AgentPay Cloudflare Worker v4.0

const DEFAULT_POLICY = {
  dailyCapSTT: 20,
  perTxCapSTT: 2,
  allowedRecipients: [],
  activeHours: { start: 0, end: 23 },
  circuitBreaker: {
    maxTxPerHour: 10,
    maxConsecutiveFailures: 5,
    pauseDurationMinutes: 60
  }
};

const GROQ_SYSTEM_PROMPT = `You are AgentPay, an autonomous payment agent on the Somnia blockchain.
You must respond ONLY with a valid JSON object in this exact format:
{
  "action": "pay" | "schedule" | "cancel_schedule" | "list_schedules" | "status" | "history" | "policy" | "update_policy" | "help" | "unknown",
  "to": "0x address or null",
  "amount": number or null,
  "reason": "short description or null",
  "message": "your response to the user in plain English",
  "interval": "every X minutes/hours/days or null",
  "jobId": number or null,
  "conditions": {
    "minBalance": number or null,
    "executeAt": "HH:MM or null",
    "executeOnDay": "monday...sunday or null",
    "executeOnDate": "YYYY-MM-DD or null",
    "maxDailySpend": number or null,
    "executeOnce": true or false
  },
  "policyUpdate": {
    "field": "dailyCap" | "perTxCap" | "addWhitelist" | "removeWhitelist" | "activeHours" | "maxTxPerHour" | null,
    "value": number or null,
    "address": "0x address or null",
    "start": number or null,
    "end": number or null
  }
}
Never make up addresses or amounts. Keep message short and friendly. Always respond with valid JSON only, no extra text.`;

// ── Helpers ───────────────────────────────────────────────────────────────────

function json(data, status = 200) {
  return new Response(JSON.stringify(data, null, 2), {
    status,
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Headers': 'x-api-key, Content-Type',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS'
    }
  });
}

async function readKV(env, key) {
  const val = await env.AGENTPAY_KV.get(key);
  if (!val) return null;
  try { return JSON.parse(val); } catch { return null; }
}

async function writeKV(env, key, data) {
  await env.AGENTPAY_KV.put(key, JSON.stringify(data));
}

function getTodaySpend(spendlog) {
  const today = new Date().toDateString();
  return spendlog
    .filter(s => s.date === today && !s.failed)
    .reduce((sum, s) => sum + s.amount, 0);
}

function getLastHourTxCount(spendlog) {
  const oneHourAgo = Date.now() - 60 * 60 * 1000;
  return spendlog.filter(s => s.timestamp > oneHourAgo && !s.failed).length;
}

function getConsecutiveFailures(spendlog) {
  let count = 0;
  for (let i = spendlog.length - 1; i >= 0; i--) {
    if (spendlog[i].failed) count++;
    else break;
  }
  return count;
}

async function checkPolicy(env, address, to, amount) {
  const policy   = (await readKV(env, 'policy:'      + address)) || DEFAULT_POLICY;
  const spendlog = (await readKV(env, 'spendlog:'    + address)) || [];
  const cb       = (await readKV(env, 'circuitbreaker:' + address)) || { paused: false, pausedUntil: 0 };

  if (cb.paused && Date.now() < cb.pausedUntil) {
    const mins = Math.ceil((cb.pausedUntil - Date.now()) / 60000);
    return { allowed: false, reason: 'Circuit breaker active — ' + mins + ' min(s) remaining', code: 'CIRCUIT_BREAKER_ACTIVE' };
  }

  if (cb.paused && Date.now() >= cb.pausedUntil) {
    await writeKV(env, 'circuitbreaker:' + address, { paused: false, pausedUntil: 0 });
  }

  const consecutiveFails = getConsecutiveFailures(spendlog);
  if (consecutiveFails >= policy.circuitBreaker.maxConsecutiveFailures) {
    const pausedUntil = Date.now() + policy.circuitBreaker.pauseDurationMinutes * 60 * 1000;
    await writeKV(env, 'circuitbreaker:' + address, { paused: true, pausedUntil });
    return { allowed: false, reason: 'Too many consecutive failures — agent paused', code: 'CIRCUIT_BREAKER_TRIGGERED' };
  }

  const hourlyTx = getLastHourTxCount(spendlog);
  if (hourlyTx >= policy.circuitBreaker.maxTxPerHour) {
    const pausedUntil = Date.now() + policy.circuitBreaker.pauseDurationMinutes * 60 * 1000;
    await writeKV(env, 'circuitbreaker:' + address, { paused: true, pausedUntil });
    return { allowed: false, reason: 'Tx velocity too high — ' + hourlyTx + ' tx in last hour', code: 'VELOCITY_EXCEEDED' };
  }

  const hour = new Date().getUTCHours();
  if (hour < policy.activeHours.start || hour > policy.activeHours.end) {
    return { allowed: false, reason: 'Outside active hours (' + policy.activeHours.start + ':00 - ' + policy.activeHours.end + ':00 UTC)', code: 'OUTSIDE_ACTIVE_HOURS' };
  }

  if (amount > policy.perTxCapSTT) {
    return { allowed: false, reason: 'Amount ' + amount + ' STT exceeds per-tx cap of ' + policy.perTxCapSTT + ' STT', code: 'PER_TX_CAP_EXCEEDED' };
  }

  if (policy.allowedRecipients.length > 0) {
    const whitelist = policy.allowedRecipients.map(a => a.toLowerCase());
    if (!whitelist.includes(to.toLowerCase())) {
      return { allowed: false, reason: 'Recipient ' + to + ' is not whitelisted', code: 'RECIPIENT_NOT_WHITELISTED' };
    }
  }

  const todaySpend = getTodaySpend(spendlog);
  if (todaySpend + amount > policy.dailyCapSTT) {
    return { allowed: false, reason: 'Daily cap reached — spent ' + todaySpend.toFixed(4) + '/' + policy.dailyCapSTT + ' STT today', code: 'DAILY_CAP_EXCEEDED' };
  }

  return {
    allowed: true, reason: 'All policy checks passed', code: 'APPROVED',
    meta: {
      todaySpend:      todaySpend + amount,
      dailyRemaining:  policy.dailyCapSTT - todaySpend - amount,
      hourlyTxCount:   hourlyTx + 1
    }
  };
}

async function appendToSpendlog(env, address, record) {
  const spendlog = (await readKV(env, 'spendlog:' + address)) || [];
  spendlog.push(record);
  await writeKV(env, 'spendlog:' + address, spendlog);
}

// ── Transaction signing ───────────────────────────────────────────────────────

function hexToBytes(hex) {
  hex = hex.replace('0x', '');
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < bytes.length; i++) {
    bytes[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  }
  return bytes;
}

function bytesToHex(bytes) {
  return Array.from(bytes).map(b => b.toString(16).padStart(2, '0')).join('');
}

function encodeRLP(input) {
  if (typeof input === 'bigint') {
    if (input === 0n) return new Uint8Array([0x80]);
    let hex = input.toString(16);
    if (hex.length % 2) hex = '0' + hex;
    const bytes = hexToBytes(hex);
    if (bytes.length === 1 && bytes[0] < 0x80) return bytes;
    return new Uint8Array([0x80 + bytes.length, ...bytes]);
  }
  if (input instanceof Uint8Array) {
    if (input.length === 0) return new Uint8Array([0x80]);
    if (input.length === 1 && input[0] < 0x80) return input;
    if (input.length <= 55) return new Uint8Array([0x80 + input.length, ...input]);
    const lenHex = input.length.toString(16).padStart(2, '0');
    const lenBytes = hexToBytes(lenHex);
    return new Uint8Array([0xb7 + lenBytes.length, ...lenBytes, ...input]);
  }
  if (Array.isArray(input)) {
    const encoded = input.map(encodeRLP);
    const total   = encoded.reduce((sum, e) => sum + e.length, 0);
    const combined = new Uint8Array(total);
    let offset = 0;
    for (const e of encoded) { combined.set(e, offset); offset += e.length; }
    if (total <= 55) return new Uint8Array([0xc0 + total, ...combined]);
    const lenHex  = total.toString(16).padStart(2, '0');
    const lenBytes = hexToBytes(lenHex);
    return new Uint8Array([0xf7 + lenBytes.length, ...lenBytes, ...combined]);
  }
  return new Uint8Array([0x80]);
}

async function getWalletAddress(env) {
  const privateKeyHex = env.PRIVATE_KEY.replace('0x', '');
  const bytes = hexToBytes(privateKeyHex);
  const cryptoKey = await crypto.subtle.importKey(
    'raw', bytes,
    { name: 'ECDSA', namedCurve: 'P-256' },
    true, ['sign']
  );
  const exported    = await crypto.subtle.exportKey('spki', cryptoKey);
  const pubKeyBytes = new Uint8Array(exported).slice(-64);
  const hashBuffer  = await crypto.subtle.digest('SHA-256', pubKeyBytes);
  const hashBytes   = new Uint8Array(hashBuffer);
  return '0x' + bytesToHex(hashBytes.slice(-20));
}

async function signAndSendTransaction(env, to, amountSTT) {
  const privateKeyHex  = env.PRIVATE_KEY.replace('0x', '');
  const privateKeyBytes = hexToBytes(privateKeyHex);
  const cryptoKey = await crypto.subtle.importKey(
    'raw', privateKeyBytes,
    { name: 'ECDSA', namedCurve: 'P-256' },
    false, ['sign']
  );

  const rpcUrl  = env.SOMNIA_RPC_URL || 'https://dream-rpc.somnia.network';
  const chainId = 50312n;
  const address = await getWalletAddress(env);

  const nonceRes = await fetch(rpcUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'eth_getTransactionCount', params: [address, 'latest'] })
  });
  const nonceData = await nonceRes.json();
  const nonce     = BigInt(nonceData.result);

  const gasPriceRes  = await fetch(rpcUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'eth_gasPrice', params: [] })
  });
  const gasPriceData = await gasPriceRes.json();
  const gasPrice     = BigInt(gasPriceData.result);

  const value   = BigInt(Math.round(parseFloat(amountSTT) * 1e18));
  const toBytes = hexToBytes(to.replace('0x', ''));

  const txData  = [nonce, gasPrice, 21000n, toBytes, value, new Uint8Array(0), chainId, 0n, 0n];
  const encoded = encodeRLP(txData);

  const hashBuffer = await crypto.subtle.digest('SHA-256', encoded);
  const signature  = await crypto.subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, cryptoKey, hashBuffer);

  const sigBytes = new Uint8Array(signature);
  const r = sigBytes.slice(0, 32);
  const s = sigBytes.slice(32, 64);
  const v = chainId * 2n + 35n;

  const signedTx = encodeRLP([nonce, gasPrice, 21000n, toBytes, value, new Uint8Array(0), v, r, s]);
  const rawTx    = '0x' + bytesToHex(signedTx);

  const sendRes  = await fetch(rpcUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'eth_sendRawTransaction', params: [rawTx] })
  });
  const sendData = await sendRes.json();
  if (sendData.error) throw new Error(sendData.error.message);
  return sendData.result;
}

// ── Route handlers ────────────────────────────────────────────────────────────

// GET /health
async function handleHealth(env) {
  let address = 'unavailable';
  try { address = await getWalletAddress(env); } catch {}
  return json({ status: 'ok', agent: 'AgentPay', version: '4.0', address, time: new Date().toISOString() });
}

// GET /policy
async function handleGetPolicy(request, env) {
  const address = await getWalletAddress(env);
  const policy   = (await readKV(env, 'policy:'   + address)) || DEFAULT_POLICY;
  const spendlog = (await readKV(env, 'spendlog:' + address)) || [];
  const todaySpend = getTodaySpend(spendlog);
  return json({
    perTxCap:        policy.perTxCapSTT,
    dailyCap:        policy.dailyCapSTT,
    dailySpendSoFar: parseFloat(todaySpend.toFixed(4)),
    dailyRemaining:  parseFloat((policy.dailyCapSTT - todaySpend).toFixed(4)),
    whitelist:       policy.allowedRecipients,
    activeHours:     policy.activeHours,
    circuitBreaker:  policy.circuitBreaker
  });
}

// POST /policy
async function handlePostPolicy(request, env) {
  const address = await getWalletAddress(env);
  const body    = await request.json();
  const policy  = (await readKV(env, 'policy:' + address)) || { ...DEFAULT_POLICY };

  if (body.dailyCapSTT        !== undefined) policy.dailyCapSTT        = body.dailyCapSTT;
  if (body.perTxCapSTT        !== undefined) policy.perTxCapSTT        = body.perTxCapSTT;
  if (body.allowedRecipients  !== undefined) policy.allowedRecipients  = body.allowedRecipients;
  if (body.activeHours        !== undefined) policy.activeHours        = body.activeHours;
  if (body.circuitBreaker     !== undefined) policy.circuitBreaker     = body.circuitBreaker;

  await writeKV(env, 'policy:' + address, policy);
  return json({ message: 'Policy updated', policy });
}

// GET /agents
async function handleAgents(env) {
  const address = await getWalletAddress(env);
  const agent   = await readKV(env, 'agents:' + address);
  return json({
    agents: [{
      address,
      name:        agent?.name        || 'AgentPay',
      description: agent?.description || 'Autonomous payment agent on Somnia blockchain',
      reputation:  agent?.reputation  || { total: 0, approved: 0, rejected: 0, score: 100 },
      registeredAt: agent?.registeredAt || null
    }],
    total: 1
  });
}

// GET /history
async function handleHistory(env) {
  const address  = await getWalletAddress(env);
  const spendlog = (await readKV(env, 'spendlog:' + address)) || [];
  const logs     = spendlog.slice(-20).reverse();
  return json({ logs, total: logs.length });
}

// GET /status/:requestId
async function handleStatus(request, env, requestId) {
  if (!requestId) return json({ error: 'Missing requestId' }, 400);
  const address  = await getWalletAddress(env);
  const spendlog = (await readKV(env, 'spendlog:' + address)) || [];
  const record   = spendlog.find(s => s.requestId === requestId);
  if (!record) return json({ error: 'Request not found' }, 404);
  return json({ requestId, ...record });
}

// POST /chat
async function handleChat(request, env) {
  const body = await request.json();
  const { message, conversationHistory = [] } = body;
  if (!message) return json({ error: 'Missing message' }, 400);

  const history = conversationHistory.slice(-10);
  history.push({ role: 'user', content: message });

  const groqRes = await fetch('https://api.groq.com/openai/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': 'Bearer ' + env.GROQ_API_KEY
    },
    body: JSON.stringify({
      model:       'llama-3.3-70b-versatile',
      temperature: 0.1,
      max_tokens:  400,
      messages:    [{ role: 'system', content: GROQ_SYSTEM_PROMPT }, ...history]
    })
  });

  const groqData = await groqRes.json();
  const raw      = groqData.choices?.[0]?.message?.content?.trim() || '{}';
  const cleaned  = raw.replace(/```json|```/g, '').trim();

  let intent = {};
  try { intent = JSON.parse(cleaned); }
  catch { intent = { action: 'unknown', message: 'Could not parse response' }; }

  return json({ intent, message: intent.message || '' });
}

// POST /pay
async function handlePay(request, env) {
  const body = await request.json();
  const { to, amount, reason, requestId } = body;

  if (!to || !amount || !requestId) {
    return json({ error: 'Missing required fields: to, amount, requestId' }, 400);
  }

  const address  = await getWalletAddress(env);
  const spendlog = (await readKV(env, 'spendlog:' + address)) || [];
  const duplicate = spendlog.find(s => s.requestId === requestId);
  if (duplicate) return json({ requestId, status: duplicate.status, message: 'Already processed' });

  const decision = await checkPolicy(env, address, to, parseFloat(amount));

  if (!decision.allowed) {
    await appendToSpendlog(env, address, {
      requestId, to, amount: parseFloat(amount),
      reason:    reason || 'API payment',
      failed:    true,
      blockedReason: decision.reason,
      timestamp: Date.now(),
      date:      new Date().toDateString()
    });
    return json({ requestId, status: 'rejected', reason: decision.reason, code: decision.code });
  }

  try {
    const txHash = await signAndSendTransaction(env, to, amount);
    await appendToSpendlog(env, address, {
      requestId, to, amount: parseFloat(amount),
      reason:    reason || 'API payment',
      txHash,    failed: false,
      timestamp: Date.now(),
      date:      new Date().toDateString()
    });
    return json({
      requestId, status: 'executed', txHash,
      to, amount: parseFloat(amount),
      explorer:  'https://shannon-explorer.somnia.network/tx/' + txHash,
      timestamp: new Date().toISOString()
    });
  } catch (err) {
    await appendToSpendlog(env, address, {
      requestId, to, amount: parseFloat(amount),
      reason:    reason || 'API payment',
      failed:    true, blockedReason: err.message,
      timestamp: Date.now(),
      date:      new Date().toDateString()
    });
    return json({ requestId, status: 'failed', reason: err.message }, 500);
  }
}

// ── Main router ───────────────────────────────────────────────────────────────

export default {
  async fetch(request, env) {
    const url    = new URL(request.url);
    const path   = url.pathname;
    const method = request.method;

    if (method === 'OPTIONS') {
      return new Response(null, {
        status: 204,
        headers: {
          'Access-Control-Allow-Origin':  '*',
          'Access-Control-Allow-Headers': 'x-api-key, Content-Type',
          'Access-Control-Allow-Methods': 'GET, POST, OPTIONS'
        }
      });
    }

    if (method === 'GET'  && path === '/health')           return handleHealth(env);
    if (method === 'GET'  && path === '/policy')           return handleGetPolicy(request, env);
    if (method === 'POST' && path === '/policy')           return handlePostPolicy(request, env);
    if (method === 'GET'  && path === '/agents')           return handleAgents(env);
    if (method === 'GET'  && path === '/history')          return handleHistory(env);
    if (method === 'GET'  && path.startsWith('/status/'))  return handleStatus(request, env, path.replace('/status/', ''));
    if (method === 'POST' && path === '/chat')             return handleChat(request, env);
    if (method === 'POST' && path === '/pay')              return handlePay(request, env);

    return json({ error: 'Not found' }, 404);
  }
};

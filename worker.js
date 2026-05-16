// AgentPay Cloudflare Worker v6.3 — Fully Decentralized History & Condition Engine
import { ethers } from 'ethers';

const VAULT_ADDRESS = '0x7E5235C0c711Cf2CA57a18d7BFD79a8cd453793D';

const VAULT_ABI = [
  "function getPolicy(address user) external view returns (tuple(uint256 perTxCap, uint256 dailyCap, uint256 maxTxPerHour, bool active) policy, address[] memory whitelist)",
  "function getSpendMetrics(address user) external view returns (uint256 todaySpent, uint256 currentHourTx)",
  "function execute(address user, address token, address to, uint256 amount, string reason, bytes32 requestId) external",
  "function setPolicy(uint256 perTxCap, uint256 dailyCap, uint256 maxTxPerHour, address[] calldata whitelist) external",
  "function balances(address,address) external view returns (uint256)",
  "function getSchedules(address user) external view returns (tuple(address token, address to, uint256 amount, uint256 interval, uint256 nextRun, bool active, string reason, uint256 minBalance)[])",
  "function createSchedule(address token, address to, uint256 amount, uint256 interval, string calldata reason, uint256 minBalance) external",
  "function cancelSchedule(uint256 index) external"
];

const TOKENS = {
  WSTT: "0x4A3BC48C156384f9564Fd65A53a2f3D534D8f2b7",
  PING: "0x33E7fAB0a8a5da1A923180989bD617c9c2D1C493",
  PONG: "0x9beaA0016c22B646Ac311Ab171270B0ECf23098F",
  SUSD: "0x65296738D4E5edB1515e40287B6FDf8320E6eE04",
};
const ERC20_ABI = [
  "function balanceOf(address) external view returns (uint256)",
  "function allowance(address,address) external view returns (uint256)",
  "function approve(address,uint256) external returns (bool)"
];
const V3_ROUTER = "0x6AAC14f090A35EeA150705f72D90E4CDC4a49b2C";
const V2_ROUTER = "0xc81501B65A040bF5f1794D0Ca2b953aebb2b1996";
const V3_ROUTER_ABI = [
  "function exactInputSingle((address tokenIn, address tokenOut, uint24 fee, address recipient, uint256 amountIn, uint256 amountOutMinimum, uint160 sqrtPriceLimitX96) params) external payable returns (uint256 amountOut)"
];
const V2_ROUTER_ABI = [
  "function swapExactTokensForTokens(uint256 amountIn, uint256 amountOutMin, address[] calldata path, address to, uint256 deadline) external returns (uint256[] memory amounts)"
];

const GROQ_SYSTEM_PROMPT = `You are AgentPay, a friendly and knowledgeable autonomous payment agent on the Somnia blockchain.

Your goal is to help users manage their funds securely in their personal Vault while also being a helpful companion. You can answer questions about Somnia, blockchain, or just chat about anything.

You must respond ONLY with a valid JSON object in this exact format:
{
  "action": "pay" | "schedule" | "cancel_schedule" | "list_schedules" | "status" | "balance" | "history" | "policy" | "update_policy" | "propose_swap" | "execute_swap" | "chat" | "help" | "unknown",
  "to": "0x address or null",
  "amount": number or null,
  "fromToken": "STT" | "WSTT" | "PING" | "PONG" | "SUSD" | "0x address" | null,
  "toToken": "STT" | "WSTT" | "PING" | "PONG" | "SUSD" | "0x address" | null,
  "reason": "short description or null",
  "message": "your helpful, conversational response to the user in plain English",
  "interval": "number of seconds or null",
  "jobId": number or null,
  "conditions": {
    "minBalance": number or null
  } or null,
  "policyUpdate": {
    "field": "dailyCap" | "perTxCap" | "addWhitelist" | "removeWhitelist" | "activeHours" | "maxTxPerHour" | null,
    "value": number or null,
    "address": "0x address or null",
    "start": number or null,
    "end": number or null
  } or null
}

Guidelines:
- If the user wants to swap assets, use action: "propose_swap". For fromToken and toToken, ONLY use the symbol name (STT, WSTT, PING, PONG, SUSD) — NEVER invent or use contract addresses.
- If the user says "Yes", "Confirm", "Go ahead", or similar after you proposed a swap, use action: "execute_swap".
- Available tokens on Somnia Shannon Testnet:
  - STT (Native)
  - WSTT: 0x4A3BC48C156384f9564Fd65A53a2f3D534D8f2b7 (Wrapped STT)
  - PING: 0x33E7fAB0a8a5da1A923180989bD617c9c2D1C493
  - PONG: 0x9beaA0016c22B646Ac311Ab171270B0ECf23098F
  - SUSD: 0x65296738D4E5edB1515e40287B6FDf8320E6eE04 (Stable USD)
- Be helpful and smart. If they ask about Somnia, tell them it is the high-performance blockchain for the mass-consumer metaverse.
- If they want to pay, extract details and use action: "pay".
- If the user asks for history, recent transactions, or activity, use action: "history". Do NOT say you lack access to transaction data.
- If the user says anything like "my balance", "show balance", "what is my balance", "token balance", "how much do I have", use action: "balance". This is NOT status.
- For action: "schedule", the "interval" field MUST be the number of seconds (e.g., 86400 for a day, 3600 for an hour). If they mention a minimum balance, put it in conditions.minBalance.
- The "message" field must NEVER be empty. Always write a helpful, conversational response in plain English. If you have nothing else to say, acknowledge the user.
- Never make up addresses or amounts.
- If the user has no wallet connected (no address in context) and they ask to pay, swap, check balance, or do anything on-chain, respond with action: "chat" and tell them to connect their wallet first using the Connect button.
- Always respond with valid JSON only, no extra text`;

// ── Helpers ───────────────────────────────────────────────────────────────────

function json(data, status = 200) {
  return new Response(JSON.stringify(data, null, 2), {
    status,
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Headers': 'x-api-key, Content-Type, x-user-address',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS, DELETE'
    }
  });
}

async function getWalletAddress(env) {
  const wallet = new ethers.Wallet(env.PRIVATE_KEY);
  return wallet.address;
}

async function executePayment(env, userAddress, to, amount, requestId, reason, tokenSymbol = 'STT') {
  const provider = new ethers.JsonRpcProvider(env.SOMNIA_RPC_URL);
  const wallet = new ethers.Wallet(env.PRIVATE_KEY, provider);
  const vault = new ethers.Contract(VAULT_ADDRESS, VAULT_ABI, wallet);

  // Map symbol to address
  const tokenAddress = tokenSymbol === 'STT' ? ethers.ZeroAddress : (TOKENS[tokenSymbol.toUpperCase()] || tokenSymbol);

  try {
    const amountWei = ethers.parseEther(amount.toString());
    
    let reqIdBytes32 = ethers.ZeroHash;
    try {
        if (requestId) {
            if (requestId.startsWith('0x') && requestId.length === 66) {
                reqIdBytes32 = requestId;
            } else {
                reqIdBytes32 = ethers.id(requestId);
            }
        }
    } catch(e) {}

    const tx = await vault.execute(userAddress, tokenAddress, to, amountWei, reason || '', reqIdBytes32, { gasLimit: 800000 });
    
    const record = {
      requestId, to, amount: parseFloat(amount), token: tokenSymbol,
      reason: reason || 'Agent payment',
      txHash: tx.hash, status: 'executed',
      timestamp: new Date().toISOString()
    };
    
    await env.AGENTPAY_KV.put(`status_${requestId}`, JSON.stringify(record), { expirationTtl: 86400 });

    return { success: true, requestId, status: 'pending', txHash: tx.hash, explorer: 'https://shannon-explorer.somnia.network/tx/' + tx.hash };
  } catch (err) {
    const errorRecord = { requestId, status: 'rejected', reason: err.shortMessage || err.message, timestamp: new Date().toISOString() };
    await env.AGENTPAY_KV.put(`status_${requestId}`, JSON.stringify(errorRecord), { expirationTtl: 86400 });
    return { success: false, ...errorRecord };
  }
}

// ── Route handlers ────────────────────────────────────────────────────────────

async function handleHealth(env) {
  const address = await getWalletAddress(env);
  return json({ 
    status: 'ok', 
    agent: 'AgentPay', 
    version: '6.3 (Fully Decentralized)', 
    address, 
    vault: VAULT_ADDRESS,
    time: new Date().toISOString() 
  });
}

async function handleBalance(request, env, address) {
  const provider = new ethers.JsonRpcProvider(env.SOMNIA_RPC_URL);
  const vault = new ethers.Contract(VAULT_ADDRESS, VAULT_ABI, provider);
  try {
    const [sttRaw, vaultRaw, wsttRaw, pingRaw, pongRaw, susdRaw] = await Promise.all([
      provider.getBalance(address),
      vault.balances(address),
      new ethers.Contract(TOKENS.WSTT, ERC20_ABI, provider).balanceOf(address),
      new ethers.Contract(TOKENS.PING, ERC20_ABI, provider).balanceOf(address),
      new ethers.Contract(TOKENS.PONG, ERC20_ABI, provider).balanceOf(address),
      new ethers.Contract(TOKENS.SUSD, ERC20_ABI, provider).balanceOf(address),
    ]);
    return json({
      address,
      balances: {
        STT:  parseFloat(ethers.formatEther(sttRaw)).toFixed(4),
        WSTT: parseFloat(ethers.formatEther(wsttRaw)).toFixed(4),
        PING: parseFloat(ethers.formatEther(pingRaw)).toFixed(4),
        PONG: parseFloat(ethers.formatEther(pongRaw)).toFixed(4),
        SUSD: parseFloat(ethers.formatEther(susdRaw)).toFixed(4),
      },
      vault: parseFloat(ethers.formatEther(vaultRaw)).toFixed(4),
    });
  } catch (err) {
    return json({ error: 'Failed to fetch balances: ' + err.message }, 500);
  }
}

async function handleGetPolicy(request, env, address) {
  const provider = new ethers.JsonRpcProvider(env.SOMNIA_RPC_URL);
  const vault = new ethers.Contract(VAULT_ADDRESS, VAULT_ABI, provider);
  
  try {
    const [policy, whitelist] = await vault.getPolicy(address);
    const [todaySpent, currentHourTx] = await vault.getSpendMetrics(address);
    const balance = await vault.balances(address);

    return json({
      perTxCap:        parseFloat(ethers.formatEther(policy.perTxCap)),
      dailyCap:        parseFloat(ethers.formatEther(policy.dailyCap)),
      dailySpendSoFar: parseFloat(ethers.formatEther(todaySpent)),
      dailyRemaining:  parseFloat(ethers.formatEther(policy.dailyCap - todaySpent)),
      whitelist:       whitelist,
      active:          policy.active,
      vaultBalance:    parseFloat(ethers.formatEther(balance)),
      activeHours: { start: 0, end: 23 },
      circuitBreaker: {
        maxTxPerHour: Number(policy.maxTxPerHour),
        maxConsecutiveFailures: 5,
        pauseDurationMinutes: 60,
        paused: false
      }
    });
  } catch (err) {
    return json({ error: 'Failed to fetch on-chain policy', details: err.message, active: false }, 500);
  }
}

async function handleChat(request, env) {
const userAddress = request.headers.get("x-user-address");
if (!userAddress) return json({ error: 'Missing address' }, 401);

const body = await request.json();
const { message, vaultBalance } = body;
if (!message) return json({ error: 'Missing message' }, 400);

const kvKey = `chat_history_${userAddress.toLowerCase()}`;
let history = [];
try {
const stored = await env.AGENTPAY_KV.get(kvKey);
if (stored) history = JSON.parse(stored);
} catch (e) {}

const walletContext = `
The user wallet is connected. Address: ${userAddress}.`;
let freshVaultBalance = null;
try {
  const provider = new ethers.JsonRpcProvider(env.SOMNIA_RPC_URL);
  const vault = new ethers.Contract(VAULT_ADDRESS, VAULT_ABI, provider);
  const raw = await vault.balances(userAddress);
  freshVaultBalance = parseFloat(ethers.formatEther(raw)).toFixed(4);
} catch(e) {}
const balanceContext = freshVaultBalance ? `
Vault balance: ${freshVaultBalance} STT.` : "";
const dateContext = `
Today's date is: ${new Date().toISOString().split('T')[0]}`;
const fullContext = GROQ_SYSTEM_PROMPT + walletContext + balanceContext + dateContext;

const groqRes = await fetch('https://api.groq.com/openai/v1/chat/completions', {
method: 'POST',
headers: {
'Content-Type': 'application/json',
'Authorization': 'Bearer ' + env.GROQ_API_KEY
},
body: JSON.stringify({
model: 'llama-3.3-70b-versatile',
temperature: 0.1,
max_tokens: 400,
messages: [
{ role: 'system', content: fullContext },
...history.slice(-15).map(m => ({ role: m.role, content: m.content })),
{ role: 'user', content: message }
]
})
});

const groqData = await groqRes.json();
const raw = groqData.choices?.[0]?.message?.content?.trim() || '{}';
const cleaned = raw.replace(/```json|```/g, '').trim();

try {
const intent = JSON.parse(cleaned);
const assistantMsg = intent.message || 'Got it!';

// ── Enrich with real on-chain data ─────────────────────────────────────
let enrichedData = null;

if (intent.action === 'balance') {
const balanceRes = await handleBalance({ headers: new Headers() }, env, userAddress);
const balanceJson = await balanceRes.json();
enrichedData = balanceJson;
const b = balanceJson.balances || {};
const vb = balanceJson.vault || '0';
intent.message = `Your current balances:\nVault: ${vb} STT\n${Object.entries(b).map(([t,a]) => `${t}: ${a}`).join('\n')}`;
}
else if (intent.action === 'policy') {
const policyRes = await handleGetPolicy({ headers: new Headers() }, env, userAddress);
const policyJson = await policyRes.json();
enrichedData = policyJson;
const p = policyJson;
if (p && p.perTxCap !== undefined) {
intent.message = `Your spending policy:\nPer Tx Cap: ${p.perTxCap} STT\nDaily Cap: ${p.dailyCap} STT\nSpent Today: ${p.dailySpendSoFar} STT\nRemaining: ${p.dailyRemaining} STT\nStatus: ${p.active ? 'ACTIVE' : 'PAUSED'}`;
}
}
// Add more actions later (swap proposal, schedules, etc.)

// Save to history (clean version - no full intent object to avoid Groq errors)
history.push({ role: 'user', content: message, timestamp: Date.now() });
history.push({ 
role: 'assistant', 
content: assistantMsg, 
timestamp: Date.now(),
intent: { action: intent.action } // minimal for history
});

if (history.length > 50) history = history.slice(-50);
await env.AGENTPAY_KV.put(kvKey, JSON.stringify(history));

// Return enriched response
return json({ 
intent, 
message: assistantMsg,
data: enrichedData 
});

} catch (e) {
console.error("Chat parse error:", e);
return json({ intent: { action: 'chat', message: raw }, message: raw });
}
}
async function handleGetChat(request, env, address) {
  const kvKey = `chat_history_${address.toLowerCase()}`;
  const stored = await env.AGENTPAY_KV.get(kvKey);
  return json({ history: stored ? JSON.parse(stored) : [] });
}

async function handleClearChat(request, env, address) {
  const kvKey = `chat_history_${address.toLowerCase()}`;
  await env.AGENTPAY_KV.delete(kvKey);
  return json({ success: true, message: 'Memory cleared' });
}

async function handlePay(request, env, address) {
  const body = await request.json();
  const { to, amount, requestId, reason, fromToken } = body;
  if (!to || !amount) return json({ error: 'Missing to or amount' }, 400);

  const result = await executePayment(env, address, to, amount, requestId, reason, fromToken || 'STT');
  return json(result, result.success ? 200 : 400);
}

async function handleGetHistory(request, env, address) {
  // Frontend now fetches from on-chain logs. 
  // We'll return an empty list here to avoid breaking old clients,
  // or return an error to force them to upgrade.
  return json({ logs: [] });
}

async function handleStatus(request, env, requestId) {
  const stored = await env.AGENTPAY_KV.get(`status_${requestId}`);
  if (!stored) return json({ error: 'Request not found' }, 404);
  return json(JSON.parse(stored));
}

async function handleGetSchedules(request, env, address) {
  const provider = new ethers.JsonRpcProvider(env.SOMNIA_RPC_URL);
  const vault = new ethers.Contract(VAULT_ADDRESS, VAULT_ABI, provider);
  
  try {
    const rawSchedules = await vault.getSchedules(address);
    const schedules = rawSchedules.map((s, index) => ({
      id: index,
      to: s.to,
      amount: parseFloat(ethers.formatEther(s.amount)),
      interval: Number(s.interval),
      nextRun: Number(s.nextRun) * 1000,
      active: s.active,
      reason: s.reason,
      minBalance: parseFloat(ethers.formatEther(s.minBalance))
    }));
    return json({ schedules });
  } catch (err) {
    return json({ error: 'Failed to fetch on-chain schedules', details: err.message }, 500);
  }
}

async function handlePostSchedule(request, env, address) {
  const body = await request.json();
  const { to, amount, reason, interval, conditions } = body;
  const minBal = conditions?.minBalance || 0;
  
  // Return the data for the frontend to sign the createSchedule transaction
  return json({ 
    action: 'contract_call',
    function: 'createSchedule',
    args: [to, ethers.parseEther(amount.toString()).toString(), Number(interval), reason || '', ethers.parseEther(minBal.toString()).toString()]
  });
}

async function handleCancelSchedule(request, env, address, jobId) {
  // Return the data for the frontend to sign the cancelSchedule transaction
  return json({ 
    action: 'contract_call',
    function: 'cancelSchedule',
    args: [Number(jobId)]
  });
}

async function handleSwap(request, env, address) {
  const body = await request.json();
  const { fromToken, toToken, amount, execute } = body;
  if (!fromToken || !toToken || !amount) return json({ error: 'Missing fields' }, 400);

  const provider = new ethers.JsonRpcProvider(env.SOMNIA_RPC_URL);
  const wallet = new ethers.Wallet(env.PRIVATE_KEY, provider);
  const amountWei = ethers.parseEther(amount.toString());
  const deadline = Math.floor(Date.now() / 1000) + 600;

  const resolve = (sym) => (sym === 'STT' ? TOKENS.WSTT : (TOKENS[sym.toUpperCase()] || sym));
  const addrIn = resolve(fromToken);
  const addrOut = resolve(toToken);
  const isNativeIn = fromToken === 'STT';
  const isV2 = (addrIn === TOKENS.WSTT && addrOut === TOKENS.SUSD) || (addrIn === TOKENS.SUSD && addrOut === TOKENS.WSTT);

  if (!execute) return json({ expectedOut: 'estimated on execution', gasFee: '0.0018' });

  try {
    let tx;
    if (isV2) {
      if (!isNativeIn) {
        const token = new ethers.Contract(addrIn, ERC20_ABI, wallet);
        const allowance = await token.allowance(wallet.address, V2_ROUTER);
        if (allowance < amountWei) await (await token.approve(V2_ROUTER, ethers.MaxUint256)).wait();
      }
      const router = new ethers.Contract(V2_ROUTER, V2_ROUTER_ABI, wallet);
      tx = await router.swapExactTokensForTokens(amountWei, 0, [addrIn, addrOut], address, deadline, { gasLimit: 2000000 });
    } else {
      if (!isNativeIn) {
        const token = new ethers.Contract(addrIn, ERC20_ABI, wallet);
        const allowance = await token.allowance(wallet.address, V3_ROUTER);
        if (allowance < amountWei) await (await token.approve(V3_ROUTER, ethers.MaxUint256)).wait();
      }
      const router = new ethers.Contract(V3_ROUTER, V3_ROUTER_ABI, wallet);
      tx = await router.exactInputSingle({ tokenIn: addrIn, tokenOut: addrOut, fee: 500, recipient: address, amountIn: amountWei, amountOutMinimum: 0n, sqrtPriceLimitX96: 0n }, { gasLimit: 1400000, value: isNativeIn ? amountWei : 0n });
    }
    const receipt = await tx.wait();
    return json({ txHash: receipt.hash, status: 'success', explorer: 'https://explorer.somnia.network/tx/' + receipt.hash });
  } catch (err) {
    return json({ error: err.shortMessage || err.message, status: 'failed' }, 400);
  }
}

// ── Main router ───────────────────────────────────────────────────────────────

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const path = url.pathname;
    const method = request.method;
    const userAddress = request.headers.get('x-user-address');

    if (method === 'OPTIONS') {
      return new Response(null, {
        status: 204,
        headers: {
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Headers': 'x-api-key, Content-Type, x-user-address',
          'Access-Control-Allow-Methods': 'GET, POST, OPTIONS, DELETE'
        }
      });
    }

    if (method === 'GET' && path === '/health') return handleHealth(env);
    if (!userAddress) return json({ error: 'Missing x-user-address header' }, 401);

    if (method === 'GET'  && path === '/policy')  return handleGetPolicy(request, env, userAddress);
    if (method === 'POST' && path === '/chat')    return handleChat(request, env);
    if (method === 'GET'  && path === '/chat')    return handleGetChat(request, env, userAddress);
    if (method === 'DELETE' && path === '/chat')  return handleClearChat(request, env, userAddress);
    if (method === 'GET'  && path === '/history') return handleGetHistory(request, env, userAddress);
    if (method === 'GET'  && path === '/schedules') return handleGetSchedules(request, env, userAddress);
    if (method === 'POST' && path === '/schedules') return handlePostSchedule(request, env, userAddress);
    if (path.startsWith('/schedules/') && method === 'DELETE') return handleCancelSchedule(request, env, userAddress, path.split('/').pop());
    if (path.startsWith('/status/') && method === 'GET') return handleStatus(request, env, path.split('/').pop());
    if (method === 'POST' && path === '/pay')     return handlePay(request, env, userAddress);
    if (method === 'GET'  && path === '/balance') return handleBalance(request, env, userAddress);
    if (method === 'POST' && path === '/swap')    return handleSwap(request, env, userAddress);

    return json({ error: 'Not found' }, 404);
  }
};

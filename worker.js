// AgentPay Cloudflare Worker — Autonomous USDC Payment Agent
import { ethers } from 'ethers';

async function getDynamicVaultAddress(env, userAddress) {
  if (!userAddress) throw new Error("Could not resolve your vault. Please reconnect your wallet.");
  try {
    const serverUrl = env.NODE_SERVER_URL || 'http://localhost:3000';
    // P1-9: authenticate Worker↔Render with the shared operator key.
    const headers = { 'x-user-address': userAddress };
    if (env.APP_API_KEY) headers['x-api-key'] = env.APP_API_KEY;
    const res = await fetch(`${serverUrl}/vault-address`, { headers });
    if (!res.ok) throw new Error();
    const data = await res.json();
    if (!data.address) throw new Error();
    return data.address;
  } catch (e) {
    throw new Error("Could not resolve your vault. Please reconnect your wallet.");
  }
}

const VAULT_ABI = [
  "function getPolicy(address user) external view returns (tuple(uint256 perTxCap, uint256 dailyCap, uint256 maxTxPerHour, bool active) policy, address[] memory whitelist)",
  "function getSpendMetrics(address user) external view returns (uint256 todaySpent, uint256 currentHourTx)",
  "function execute(address user, address to, uint256 amount, string reason, bytes32 requestId) external",
  "function multicall(address user, address[] targets, uint256[] amounts, string reason, bytes32 requestId) external",
  "function setPolicy(uint256 perTxCap, uint256 dailyCap, uint256 maxTxPerHour, address[] calldata whitelist) external",
  "function balances(address) external view returns (uint256)",
  "function getBalance(address user) external view returns (uint256)",
  "function getSchedules(address user) external view returns (tuple(address to, uint256 amount, uint256 interval, uint256 nextRun, bool active, string reason, uint256 minBalance)[])",
  "function createSchedule(address to, uint256 amount, uint256 interval, string reason, uint256 minBalance) external",
  "function cancelSchedule(uint256 index) external",
  "function executeScheduled(address user, uint256 index) external"
];

const TOKENS = {
  USDC: "0x3600000000000000000000000000000000000000",
};
const ERC20_ABI = [
  "function balanceOf(address) external view returns (uint256)",
  "function allowance(address,address) external view returns (uint256)",
  "function approve(address,uint256) external returns (bool)",
  "function transfer(address,uint256) external returns (bool)"
];

const GROQ_SYSTEM_PROMPT = `You are AgentPay, a friendly and knowledgeable autonomous USDC payment agent on the Arc blockchain.

Your goal is to help users manage their USDC securely in their personal Vault while also being a helpful companion. You can answer questions about Arc, blockchain, or just chat about anything.

You must respond ONLY with a valid JSON object in this exact format:
{
  "action": "pay" | "schedule" | "status" | "balance" | "history" | "policy" | "update_policy" | "chat" | "help" | "unknown",
  "to": "0x address or null",
  "amount": number or null,
  "reason": "short description or null",
  "message": "your helpful, conversational response",
  "interval": "number of seconds or null",
  "jobId": number or null
}

Guidelines:
- The only supported token is USDC. Do not reference other tokens.
- Arc is the high-performance blockchain for the mass-consumer metaverse.
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

async function trackUser(env, address) {
  try {
    const key = 'active_users';
    const addr = address.toLowerCase();
    let users = JSON.parse(await env.AGENTPAY_KV.get(key) || '[]');
    if (!users.includes(addr)) {
      users.push(addr);
      await env.AGENTPAY_KV.put(key, JSON.stringify(users));
    }
  } catch(e) {}
}

async function executePayment(env, userAddress, to, amount, requestId, reason, tokenSymbol = 'USDC') {
  const provider = new ethers.JsonRpcProvider(env.ARC_RPC);
  const wallet = new ethers.Wallet(env.PRIVATE_KEY, provider);
  const vaultAddr = await getDynamicVaultAddress(env, userAddress);
  const vault = new ethers.Contract(vaultAddr, VAULT_ABI, wallet);

  const tokenAddress = ethers.ZeroAddress;

  try {
    const amountWei = ethers.parseEther(amount.toString());
    let reqIdBytes32 = requestId ? (requestId.startsWith('0x') ? requestId : ethers.id(requestId)) : ethers.ZeroHash;

    // Hardened contract: execute(user, to, amount, reason, requestId) — no token arg.
    const tx = await vault.execute(userAddress, to, amountWei, reason || '', reqIdBytes32, { gasLimit: 800000 });
    const record = { requestId, to, amount: parseFloat(amount), token: tokenSymbol, txHash: tx.hash, status: 'executed', timestamp: new Date().toISOString() };
    await env.AGENTPAY_KV.put(`status_${requestId}`, JSON.stringify(record), { expirationTtl: 86400 });
    return { success: true, requestId, txHash: tx.hash, explorer: 'https://testnet.arcscan.arc.network/tx/' + tx.hash };
  } catch (err) {
    return { success: false, error: err.message };
  }
}

// ── Route handlers ────────────────────────────────────────────────────────────

async function handleHealth(env) {
  const address = await getWalletAddress(env);
  return json({ status: 'ok', version: '6.5', address });
}

async function handleBalance(request, env, address) {
  const provider = new ethers.JsonRpcProvider(env.ARC_RPC);
  const vaultAddr = await getDynamicVaultAddress(env, address);
  const vault = new ethers.Contract(vaultAddr, VAULT_ABI, provider);
  const [usdcRaw, vaultRaw] = await Promise.all([
    new ethers.Contract(TOKENS.USDC, ERC20_ABI, provider).balanceOf(address),
    vault.getBalance(address),
  ]);
  return json({ address, balances: { USDC: ethers.formatEther(usdcRaw) }, vault: ethers.formatEther(vaultRaw) });
}

async function handleGetPolicy(request, env, address) {
  const provider = new ethers.JsonRpcProvider(env.ARC_RPC);
  const vaultAddr = await getDynamicVaultAddress(env, address);
  const vault = new ethers.Contract(vaultAddr, VAULT_ABI, provider);
  const [policy, whitelist] = await vault.getPolicy(address);
  const [todaySpent, currentHourTx] = await vault.getSpendMetrics(address);
  const balance = await vault.getBalance(address);
  return json({ perTxCap: ethers.formatEther(policy.perTxCap), dailyCap: ethers.formatEther(policy.dailyCap), dailySpendSoFar: ethers.formatEther(todaySpent), dailyRemaining: ethers.formatEther(policy.dailyCap - todaySpent), whitelist, active: policy.active, vaultBalance: ethers.formatEther(balance), circuitBreaker: { maxTxPerHour: Number(policy.maxTxPerHour) } });
}

async function handleChat(request, env) {
  const userAddress = request.headers.get("x-user-address") || null;
  if (userAddress) await trackUser(env, userAddress);
  const { message, vaultBalance } = await request.json();
  const kvKey = userAddress ? `chat_history_${userAddress.toLowerCase()}` : null;
  let history = kvKey ? JSON.parse(await env.AGENTPAY_KV.get(kvKey) || '[]') : [];

  const groqRes = await fetch('https://api.groq.com/openai/v1/chat/completions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + env.GROQ_API_KEY },
    body: JSON.stringify({
      model: 'llama-3.3-70b-versatile', temperature: 0.1, max_tokens: 400,
      messages: [{ role: 'system', content: GROQ_SYSTEM_PROMPT }, ...history.slice(-10).map(m => ({ role: m.role, content: m.content })), { role: 'user', content: message }]
    })
  });

  const groqData = await groqRes.json();
  if (!groqData.choices) return json({ error: groqData.error?.message || JSON.stringify(groqData) }, 500);
  const intent = JSON.parse(groqData.choices[0].message.content.replace(/```json|```/g, '').trim());
  let enrichedData = null;

  if (intent.action === 'balance') enrichedData = await (await handleBalance(null, env, userAddress)).json();
  if (intent.action === 'policy') enrichedData = await (await handleGetPolicy(null, env, userAddress)).json();

  history.push({ role: 'user', content: message }, { role: 'assistant', content: intent.message, intent });
  if (kvKey) await env.AGENTPAY_KV.put(kvKey, JSON.stringify(history.slice(-50)));

  return json({ intent, message: intent.message, data: enrichedData });
}

// ── Main router ───────────────────────────────────────────────────────────────

export default {
  async scheduled(event, env) {
    const users = JSON.parse(await env.AGENTPAY_KV.get('active_users') || '[]');
    const provider = new ethers.JsonRpcProvider(env.ARC_RPC);
    const wallet = new ethers.Wallet(env.PRIVATE_KEY, provider);
    for (const user of users) {
      try {
        const vaultAddr = await getDynamicVaultAddress(env, user);
        const vault = new ethers.Contract(vaultAddr, VAULT_ABI, wallet);
        const schedules = await vault.getSchedules(user);
        for (let i = 0; i < schedules.length; i++) {
          if (schedules[i].active && Math.floor(Date.now() / 1000) >= Number(schedules[i].nextRun)) {
            await (await vault.executeScheduled(user, i, { gasLimit: 1000000 })).wait();
          }
        }
      } catch (e) {
        console.error(`Scheduled task failed for user ${user}: ${e.message}`);
      }
    }
  },
  async fetch(request, env) {
    const url = new URL(request.url);
    const path = url.pathname;
    const method = request.method;
    const userAddress = request.headers.get('x-user-address');
    if (method === 'OPTIONS') return new Response(null, { status: 204, headers: { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': '*', 'Access-Control-Allow-Methods': '*' } });
    if (path === '/health') return handleHealth(env);

    try {
      if (path === '/chat') return handleChat(request, env);
      if (!userAddress) return json({ error: 'Unauthorized' }, 401);
      if (path === '/policy') return handleGetPolicy(request, env, userAddress);
      if (path === '/pay') return handlePay(request, env, userAddress);
      if (path === '/balance') return handleBalance(request, env, userAddress);
    } catch (err) {
      if (err.message.includes("Could not resolve your vault")) {
        return json({ error: err.message }, 400);
      }
      console.error(`Request failed: ${err.message}`);
      return json({ error: 'Internal Server Error' }, 500);
    }
    return json({ error: 'Not found' }, 404);
  }
};

async function handlePay(request, env, address) {
  const { to, amount, requestId, reason, fromToken } = await request.json();
  return json(await executePayment(env, address, to, amount, requestId, reason, fromToken || 'USDC'));
}

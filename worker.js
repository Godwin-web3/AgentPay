// AgentPay Cloudflare Worker v6.4 — Autonomous Atomic Intent Engine
import { ethers } from 'ethers';

const VAULT_ADDRESS = '0x4471917E96271F688282ae283d62De0B5Be8084C';

const VAULT_ABI = [
  "function getPolicy(address user) external view returns (tuple(uint256 perTxCap, uint256 dailyCap, uint256 maxTxPerHour, bool active) policy, address[] memory whitelist)",
  "function getSpendMetrics(address user) external view returns (uint256 todaySpent, uint256 currentHourTx)",
  "function execute(address user, address token, address to, uint256 amount, string reason, bytes32 requestId) external",
  "function multicall(address user, address[] calldata targets, bytes[] calldata datas, uint256[] calldata values, address policyToken, uint256 totalAmount, string calldata reason, bytes32 requestId) external",
  "function setPolicy(uint256 perTxCap, uint256 dailyCap, uint256 maxTxPerHour, address[] calldata whitelist) external",
  "function balances(address,address) external view returns (uint256)",
  "function getBalance(address,address) external view returns (uint256)",
  "function getSchedules(address user) external view returns (tuple(address token, address to, uint256 amount, uint256 interval, uint256 nextRun, bool active, string reason, uint256 minBalance)[])",
  "function createSchedule(address token, address to, uint256 amount, uint256 interval, string calldata reason, uint256 minBalance) external",
  "function cancelSchedule(uint256 index) external",
  "function executeSchedule(address user, uint256 index) external"
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
  "function approve(address,uint256) external returns (bool)",
  "function transfer(address,uint256) external returns (bool)"
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

*** NEW FEATURE: ATOMIC INTENTS ***
You can now execute complex "Atomic Intents" in a single transaction. 
Intents currently supported:
1. "provide_liquidity": Add STT to the PING/SUSD liquidity pool.
2. "safe_swap_pay": Swap STT to SUSD and then pay a recipient (Atomic Swap+Pay).

You must respond ONLY with a valid JSON object in this exact format:
{
  "action": "pay" | "schedule" | "intent" | "status" | "balance" | "history" | "policy" | "update_policy" | "propose_swap" | "execute_swap" | "chat" | "help" | "unknown",
  "intentName": "provide_liquidity" | "safe_swap_pay" | null,
  "to": "0x address or null",
  "amount": number or null,
  "fromToken": "STT" | "WSTT" | "PING" | "PONG" | "SUSD" | null,
  "toToken": "STT" | "WSTT" | "PING" | "PONG" | "SUSD" | null,
  "reason": "short description or null",
  "message": "your helpful, conversational response",
  "interval": "number of seconds or null",
  "jobId": number or null
}

Guidelines:
- For complex requests like "Add my 5 STT to the PING pool" or "Pay 10 SUSD to Bob but use my STT", use action: "intent" and set the intentName.
- Available tokens on Somnia Shannon Testnet:
  - STT (Native)
  - WSTT: 0x4A3BC48C156384f9564Fd65A53a2f3D534D8f2b7 (Wrapped STT)
  - PING: 0x33E7fAB0a8a5da1A923180989bD617c9c2D1C493
  - PONG: 0x9beaA0016c22B646Ac311Ab171270B0ECf23098F
  - SUSD: 0x65296738D4E5edB1515e40287B6FDf8320E6eE04 (Stable USD)
- Be helpful and smart. Somnia is the high-performance blockchain for the mass-consumer metaverse.
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

async function executePayment(env, userAddress, to, amount, requestId, reason, tokenSymbol = 'STT') {
  const provider = new ethers.JsonRpcProvider(env.SOMNIA_RPC_URL);
  const wallet = new ethers.Wallet(env.PRIVATE_KEY, provider);
  const vaultAddr = env.VAULT_ADDRESS || VAULT_ADDRESS;
  const vault = new ethers.Contract(vaultAddr, VAULT_ABI, wallet);

  const tokenAddress = tokenSymbol === 'STT' ? ethers.ZeroAddress : (TOKENS[tokenSymbol.toUpperCase()] || tokenSymbol);

  try {
    const amountWei = ethers.parseEther(amount.toString());
    let reqIdBytes32 = requestId ? (requestId.startsWith('0x') ? requestId : ethers.id(requestId)) : ethers.ZeroHash;

    const tx = await vault.execute(userAddress, tokenAddress, to, amountWei, reason || '', reqIdBytes32, { gasLimit: 800000 });
    const record = { requestId, to, amount: parseFloat(amount), token: tokenSymbol, txHash: tx.hash, status: 'executed', timestamp: new Date().toISOString() };
    await env.AGENTPAY_KV.put(`status_${requestId}`, JSON.stringify(record), { expirationTtl: 86400 });
    return { success: true, requestId, txHash: tx.hash, explorer: 'https://shannon-explorer.somnia.network/tx/' + tx.hash };
  } catch (err) {
    return { success: false, error: err.message };
  }
}

async function handleIntent(env, userAddress, intentName, amount, to, reason) {
  const provider = new ethers.JsonRpcProvider(env.SOMNIA_RPC_URL);
  const wallet = new ethers.Wallet(env.PRIVATE_KEY, provider);
  const vaultAddr = env.VAULT_ADDRESS || VAULT_ADDRESS;
  const vault = new ethers.Contract(vaultAddr, VAULT_ABI, wallet);
  const amountWei = ethers.parseEther(amount.toString());

  const targets = [];
  const datas = [];
  const values = [];

  if (intentName === 'safe_swap_pay') {
    // 1. Swap STT -> SUSD (V3)
    const routerIface = new ethers.Interface(V3_ROUTER_ABI);
    const erc20Iface = new ethers.Interface(ERC20_ABI);
    
    // We swap Native STT -> SUSD. V3 Router accepts native STT if passed as 'value'.
    // No approval needed for native STT, but SUSD transfer later needs balance.
    
    datas.push(routerIface.encodeFunctionData("exactInputSingle", [{
      tokenIn: TOKENS.WSTT, tokenOut: TOKENS.SUSD, fee: 500, recipient: vaultAddr,
      amountIn: amountWei, amountOutMinimum: 0, sqrtPriceLimitX96: 0
    }]));
    targets.push(V3_ROUTER);
    values.push(amountWei);

    // 2. Transfer SUSD to recipient. 
    // Note: We don't know exact amountOut, so we use a large balance check or just 
    // assume 1:1 for the demo (hackathon logic).
    datas.push(erc20Iface.encodeFunctionData("transfer", [to, amountWei])); 
    targets.push(TOKENS.SUSD);
    values.push(0);

    const tx = await vault.multicall(userAddress, targets, datas, values, ethers.ZeroAddress, amountWei, reason || "Atomic Swap+Pay", ethers.id(Date.now().toString()));
    return { success: true, status: 'executed', txHash: tx.hash, explorer: 'https://shannon-explorer.somnia.network/tx/' + tx.hash };
  }

  if (intentName === 'provide_liquidity') {
    // 1. Swap HALF of STT to SUSD (V2)
    const halfAmount = amountWei / 2n;
    const routerIface = new ethers.Interface(V2_ROUTER_ABI);
    const erc20Iface = new ethers.Interface(ERC20_ABI);
    
    // Path: WSTT -> SUSD
    datas.push(routerIface.encodeFunctionData("swapExactTokensForTokens", [
      halfAmount, 0, [TOKENS.WSTT, TOKENS.SUSD], vaultAddr, Math.floor(Date.now() / 1000) + 600
    ]));
    targets.push(V2_ROUTER);
    values.push(halfAmount);

    // 2. Add Liquidity STT + SUSD
    // We assume the other half of STT and the received SUSD are used.
    // For simplicity in the multicall, we use the same halfAmount for SUSD desired (demo logic)
    datas.push(routerIface.encodeFunctionData("addLiquidity", [
      TOKENS.WSTT, TOKENS.SUSD, halfAmount, halfAmount, 0, 0, vaultAddr, Math.floor(Date.now() / 1000) + 600
    ]));
    targets.push(V2_ROUTER);
    values.push(halfAmount);

    try {
      const tx = await vault.multicall(userAddress, targets, datas, values, ethers.ZeroAddress, amountWei, "Provide Liquidity (Atomic)", ethers.id(Date.now().toString()));
      return { success: true, status: 'executed', txHash: tx.hash, explorer: 'https://shannon-explorer.somnia.network/tx/' + tx.hash };
    } catch (err) {
      return { success: false, error: err.message };
    }
  }

  return { error: 'Unknown intent', success: false };
}

// ── Route handlers ────────────────────────────────────────────────────────────

async function handleHealth(env) {
  const address = await getWalletAddress(env);
  const vaultAddr = env.VAULT_ADDRESS || VAULT_ADDRESS;
  return json({ status: 'ok', version: '6.4 (Atomic)', address, vault: vaultAddr });
}

async function handleBalance(request, env, address) {
  const provider = new ethers.JsonRpcProvider(env.SOMNIA_RPC_URL);
  const vaultAddr = env.VAULT_ADDRESS || VAULT_ADDRESS;
  const vault = new ethers.Contract(vaultAddr, VAULT_ABI, provider);
  const [sttRaw, vaultRaw, wsttRaw, pingRaw, pongRaw, susdRaw] = await Promise.all([
    provider.getBalance(address),
    vault.getBalance(address, ethers.ZeroAddress),
    new ethers.Contract(TOKENS.WSTT, ERC20_ABI, provider).balanceOf(address),
    new ethers.Contract(TOKENS.PING, ERC20_ABI, provider).balanceOf(address),
    new ethers.Contract(TOKENS.PONG, ERC20_ABI, provider).balanceOf(address),
    new ethers.Contract(TOKENS.SUSD, ERC20_ABI, provider).balanceOf(address),
  ]);
  return json({ address, balances: { STT: ethers.formatEther(sttRaw), WSTT: ethers.formatEther(wsttRaw), PING: ethers.formatEther(pingRaw), PONG: ethers.formatEther(pongRaw), SUSD: ethers.formatEther(susdRaw) }, vault: ethers.formatEther(vaultRaw) });
}

async function handleGetPolicy(request, env, address) {
  const provider = new ethers.JsonRpcProvider(env.SOMNIA_RPC_URL);
  const vaultAddr = env.VAULT_ADDRESS || VAULT_ADDRESS;
  const vault = new ethers.Contract(vaultAddr, VAULT_ABI, provider);
  const [policy, whitelist] = await vault.getPolicy(address);
  const [todaySpent, currentHourTx] = await vault.getSpendMetrics(address);
  const balance = await vault.getBalance(address, ethers.ZeroAddress);
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
    const provider = new ethers.JsonRpcProvider(env.SOMNIA_RPC_URL);
    const wallet = new ethers.Wallet(env.PRIVATE_KEY, provider);
    const vault = new ethers.Contract(env.VAULT_ADDRESS || VAULT_ADDRESS, VAULT_ABI, wallet);
    for (const user of users) {
      const schedules = await vault.getSchedules(user);
      for (let i = 0; i < schedules.length; i++) {
        if (schedules[i].active && Math.floor(Date.now() / 1000) >= Number(schedules[i].nextRun)) {
          await (await vault.executeSchedule(user, i, { gasLimit: 1000000 })).wait();
        }
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
    if (path === '/chat') return handleChat(request, env);
    if (!userAddress) return json({ error: 'Unauthorized' }, 401);
    if (path === '/policy') return handleGetPolicy(request, env, userAddress);
    if (path === '/pay') return handlePay(request, env, userAddress);
    if (path === '/balance') return handleBalance(request, env, userAddress);
    if (path === '/swap') return handleSwap(request, env, userAddress);
    if (path === '/intent') {
      const { intentName, amount, to, reason } = await request.json();
      return json(await handleIntent(env, userAddress, intentName, amount, to, reason));
    }
    return json({ error: 'Not found' }, 404);
  }
};

async function handlePay(request, env, address) {
  const { to, amount, requestId, reason, fromToken } = await request.json();
  return json(await executePayment(env, address, to, amount, requestId, reason, fromToken || 'STT'));
}

async function handleSwap(request, env, userAddress) {
  const { fromToken, toToken, amount, execute } = await request.json();
  if (!execute) {
    return json({ success: true, status: "proposing_swap", fromToken, toToken, amount });
  }
  const provider = new ethers.JsonRpcProvider(env.SOMNIA_RPC_URL);
  const wallet = new ethers.Wallet(env.PRIVATE_KEY, provider);
  const amountWei = ethers.parseEther(amount.toString());
  const deadline = Math.floor(Date.now() / 1000) + 600;
  const fromAddr = TOKENS[fromToken.toUpperCase()];
  const toAddr = TOKENS[toToken.toUpperCase()];
  if (!fromAddr || !toAddr) return json({ error: "Unsupported token. Supported: PING, PONG, WSTT, SUSD", success: false }, 400);
  const isV2Pair = ((fromAddr === TOKENS.WSTT && toAddr === TOKENS.SUSD) || (fromAddr === TOKENS.SUSD && toAddr === TOKENS.WSTT));
  try {
    const erc20 = new ethers.Contract(fromAddr, ["function allowance(address,address) external view returns (uint256)", "function approve(address,uint256) external returns (bool)"], wallet);
    const routerAddr = isV2Pair ? V2_ROUTER : V3_ROUTER;
    const allowance = await erc20.allowance(wallet.address, routerAddr);
    if (allowance < amountWei) {
      const appTx = await erc20.approve(routerAddr, ethers.MaxUint256);
      await appTx.wait();
    }
    let tx;
    if (isV2Pair) {
      const v2 = new ethers.Contract(V2_ROUTER, ["function swapExactTokensForTokens(uint256,uint256,address[],address,uint256) external returns (uint256[])"], wallet);
      tx = await v2.swapExactTokensForTokens(amountWei, 0, [fromAddr, toAddr], wallet.address, deadline, { gasLimit: 2000000 });
    } else {
      const v3 = new ethers.Contract(V3_ROUTER, V3_ROUTER_ABI, wallet);
      tx = await v3.exactInputSingle({ tokenIn: fromAddr, tokenOut: toAddr, fee: 500, recipient: wallet.address, amountIn: amountWei, amountOutMinimum: 0, sqrtPriceLimitX96: 0 }, { gasLimit: 1400000 });
    }
    const receipt = await tx.wait();
    return json({ success: true, status: "executed", txHash: receipt.hash, explorer: "https://shannon-explorer.somnia.network/tx/" + receipt.hash });
  } catch (err) {
    return json({ success: false, error: err.message });
  }
}

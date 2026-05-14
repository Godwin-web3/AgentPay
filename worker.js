// AgentPay Cloudflare Worker v5.0 — Stateless & Decentralized
import { ethers } from 'ethers';

const VAULT_ADDRESS = '0x7E5235C0c711Cf2CA57a18d7BFD79a8cd453793D';

const VAULT_ABI = [
  "function getPolicy(address user) external view returns (tuple(uint256 perTxCap, uint256 dailyCap, uint256 maxTxPerHour, bool active) policy, address[] memory whitelist)",
  "function getSpendMetrics(address user) external view returns (uint256 todaySpent, uint256 currentHourTx)",
  "function execute(address user, address to, uint256 amount) external",
  "function setPolicy(uint256 perTxCap, uint256 dailyCap, uint256 maxTxPerHour, address[] calldata whitelist) external",
  "function balances(address) external view returns (uint256)"
];

const GROQ_SYSTEM_PROMPT = `You are AgentPay, a friendly and knowledgeable autonomous payment agent on the Somnia blockchain.
Your goal is to help users manage their funds securely while also being a helpful companion.
You must respond ONLY with a valid JSON object.`;

// ── Helpers ───────────────────────────────────────────────────────────────────

function json(data, status = 200) {
  return new Response(JSON.stringify(data, null, 2), {
    status,
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Headers': 'x-api-key, Content-Type, x-user-address',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS'
    }
  });
}

async function getWalletAddress(env) {
  const wallet = new ethers.Wallet(env.PRIVATE_KEY);
  return wallet.address;
}

// ── Route handlers ────────────────────────────────────────────────────────────

async function handleHealth(env) {
  const address = await getWalletAddress(env);
  return json({ 
    status: 'ok', 
    agent: 'AgentPay', 
    version: '5.0 (Stateless)', 
    address, 
    vault: VAULT_ADDRESS,
    time: new Date().toISOString() 
  });
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
      // Compatibility fields for frontend
      activeHours: { start: 0, end: 23 },
      circuitBreaker: {
        maxTxPerHour: Number(policy.maxTxPerHour),
        maxConsecutiveFailures: 5,
        pauseDurationMinutes: 60,
        paused: false
      }
    });
  } catch (err) {
    return json({ 
      error: 'Failed to fetch on-chain policy', 
      details: err.message,
      active: false 
    }, 500);
  }
}

async function handlePostPolicy(request, env, address) {
  const body = await request.json();
  const provider = new ethers.JsonRpcProvider(env.SOMNIA_RPC_URL);
  const wallet = new ethers.Wallet(env.PRIVATE_KEY, provider);
  const vault = new ethers.Contract(VAULT_ADDRESS, VAULT_ABI, wallet);

  // Note: On the free tier, we don't want to pay gas for every user policy update 
  // if the agent is the one signing. Usually, the user should sign their own policy update.
  // For the hackathon, we'll allow the agent to set it if it's the owner or if we use a relayer.
  // But since the agent is likely NOT the owner of the user's policy (unless the agent is the user),
  // this might fail if AgentVault.setPolicy is not permissioned correctly.
  
  // Actually, AgentVault.setPolicy uses msg.sender. So the USER must call it.
  // The Worker can only call it if it HAS the user's private key (not recommended)
  // or if we use a "Permit" style pattern.
  
  // For now, we'll return an instruction for the frontend to call the contract directly.
  return json({ 
    message: 'Policy must be updated directly on-chain by the user wallet for security.',
    contract: VAULT_ADDRESS,
    method: 'setPolicy'
  }, 403);
}

async function handleChat(request, env) {
  const body = await request.json();
  const { message, conversationHistory = [], vaultBalance } = body;
  
  const history = conversationHistory.slice(-10);
  const balanceContext = vaultBalance ? `\nThe user's current vault balance is ${vaultBalance} STT.` : "";

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
        { role: 'system', content: GROQ_SYSTEM_PROMPT + balanceContext },
        ...history,
        { role: 'user', content: message }
      ]
    })
  });

  const groqData = await groqRes.json();
  const raw = groqData.choices?.[0]?.message?.content?.trim() || '{}';
  const cleaned = raw.replace(/```json|```/g, '').trim();

  try {
    const intent = JSON.parse(cleaned);
    return json({ intent, message: intent.message || '' });
  } catch {
    return json({ intent: { action: 'chat', message: raw }, message: raw });
  }
}

async function handlePay(request, env, address) {
  const body = await request.json();
  const { to, amount, requestId } = body;

  if (!to || !amount) return json({ error: 'Missing to or amount' }, 400);

  const provider = new ethers.JsonRpcProvider(env.SOMNIA_RPC_URL);
  const wallet = new ethers.Wallet(env.PRIVATE_KEY, provider);
  const vault = new ethers.Contract(VAULT_ADDRESS, VAULT_ABI, wallet);

  try {
    const amountWei = ethers.parseEther(amount.toString());
    
    // We use a high gas limit for safety on testnet
    const tx = await vault.execute(address, to, amountWei, { gasLimit: 500000 });
    
    return json({
      requestId,
      status: 'pending',
      txHash: tx.hash,
      explorer: 'https://shannon-explorer.somnia.network/tx/' + tx.hash
    });
  } catch (err) {
    let errorMessage = err.message;
    if (err.reason) errorMessage = err.reason;
    else if (err.shortMessage) errorMessage = err.shortMessage;
    
    return json({ 
      requestId, 
      status: 'rejected', 
      reason: errorMessage,
      code: 'CONTRACT_REVERT' 
    }, 400);
  }
}

async function handleSwap(request, env, address) {
  const body = await request.json();
  const { fromToken, toToken, amount, execute } = body;

  const provider = new ethers.JsonRpcProvider(env.SOMNIA_RPC_URL);
  const wallet = new ethers.Wallet(env.PRIVATE_KEY, provider);
  
  const ROUTER_ABI = [
    "function getAmountsOut(uint amountIn, address[] calldata path) external view returns (uint[] memory amounts)",
    "function swapExactETHForTokens(uint amountOutMin, address[] calldata path, address to, uint deadline) external payable returns (uint[] memory amounts)"
  ];
  const SOMNIA_ROUTER = "0x6aac14f090a35eea150705f72d90e4cdc4a49b2c";
  const WSTT = "0xF22eF0085f6511f70b01a68F360dCc56261F768a";

  const router = new ethers.Contract(SOMNIA_ROUTER, ROUTER_ABI, wallet);
  const amountWei = ethers.parseEther(amount.toString());

  if (!execute) {
    try {
      const path = fromToken === 'STT' ? [WSTT, toToken] : [fromToken, WSTT];
      const amounts = await router.getAmountsOut(amountWei, path);
      return json({ expectedOut: ethers.formatEther(amounts[1]), gasFee: "0.0003" });
    } catch (err) {
      return json({ error: err.message }, 400);
    }
  } else {
    try {
      const deadline = Math.floor(Date.now() / 1000) + 600;
      const tx = await router.swapExactETHForTokens(0, [WSTT, toToken], address, deadline, { value: amountWei, gasLimit: 500000 });
      return json({ txHash: tx.hash, status: 'pending' });
    } catch (err) {
      return json({ error: err.message }, 400);
    }
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
          'Access-Control-Allow-Methods': 'GET, POST, OPTIONS'
        }
      });
    }

    if (method === 'GET'  && path === '/health')  return handleHealth(env);
    if (!userAddress && path !== '/chat') return json({ error: 'Missing x-user-address header' }, 401);

    if (method === 'GET'  && path === '/policy')  return handleGetPolicy(request, env, userAddress);
    if (method === 'POST' && path === '/policy')  return handlePostPolicy(request, env, userAddress);
    if (method === 'POST' && path === '/chat')    return handleChat(request, env);
    if (method === 'POST' && path === '/pay')     return handlePay(request, env, userAddress);
    if (method === 'POST' && path === '/swap')    return handleSwap(request, env, userAddress);

    return json({ error: 'Not found' }, 404);
  }
};

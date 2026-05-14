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
  if (!fromToken || !toToken || !amount) return json({ error: 'Missing fields' }, 400);

  const provider = new ethers.JsonRpcProvider(env.SOMNIA_RPC_URL);
  const wallet = new ethers.Wallet(env.PRIVATE_KEY, provider);
  const amountWei = ethers.parseEther(amount.toString());
  const deadline = Math.floor(Date.now() / 1000) + 600;

  const resolve = (sym) => {
    if (sym === 'STT') return TOKENS.WSTT;
    return TOKENS[sym.toUpperCase()] || sym;
  };

  const addrIn  = resolve(fromToken);
  const addrOut = resolve(toToken);
  const isNativeIn = fromToken === 'STT';
  const isV2 = (
    (addrIn === TOKENS.WSTT && addrOut === TOKENS.SUSD) ||
    (addrIn === TOKENS.SUSD && addrOut === TOKENS.WSTT)
  );

  if (!execute) {
    return json({ expectedOut: 'estimated on execution', gasFee: '0.0018' });
  }

  try {
    let tx;
    if (isV2) {
      if (!isNativeIn) {
        const token = new ethers.Contract(addrIn, ERC20_ABI, wallet);
        const allowance = await token.allowance(wallet.address, V2_ROUTER);
        if (allowance < amountWei) {
          const appTx = await token.approve(V2_ROUTER, ethers.MaxUint256);
          await appTx.wait();
        }
      }
      const router = new ethers.Contract(V2_ROUTER, V2_ROUTER_ABI, wallet);
      tx = await router.swapExactTokensForTokens(
        amountWei, 0, [addrIn, addrOut], address, deadline,
        { gasLimit: 2000000 }
      );
    } else {
      if (!isNativeIn) {
        const token = new ethers.Contract(addrIn, ERC20_ABI, wallet);
        const allowance = await token.allowance(wallet.address, V3_ROUTER);
        if (allowance < amountWei) {
          const appTx = await token.approve(V3_ROUTER, ethers.MaxUint256);
          await appTx.wait();
        }
      }
      const router = new ethers.Contract(V3_ROUTER, V3_ROUTER_ABI, wallet);
      tx = await router.exactInputSingle({
        tokenIn: addrIn, tokenOut: addrOut, fee: 500,
        recipient: address, amountIn: amountWei,
        amountOutMinimum: 0n, sqrtPriceLimitX96: 0n
      }, { gasLimit: 1400000, value: isNativeIn ? amountWei : 0n });
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
    if (method === 'GET'  && path === '/balance') return handleBalance(request, env, userAddress);
    if (method === 'POST' && path === '/swap')    return handleSwap(request, env, userAddress);

    return json({ error: 'Not found' }, 404);
  }
};

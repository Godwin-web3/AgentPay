require('dotenv').config();
const PolicyEngine = require('./policyEngine');
const walletService = require('./walletService');
const x402Client = require('./x402Client');
const escrow = require('./escrow');
const { appendSpend, appendFailure, getHistory, getJobsCreatedBy } = require('./spendStore');
const { parseIntent } = require('./brain');
const jobService = require('./jobService');

// P1-7: off-chain PolicyEngine is now an ADVISORY pre-check only. The
// authoritative decision lives in AgentVault.execute (per-tx/daily/hourly caps,
// whitelist) invoked via escrow.executePayment. Failing the advisory check
// short-circuits before spending gas, but an advisory pass is NOT a guarantee —
// the vault may still revert on chain.
const engine = new PolicyEngine();

async function pay(walletId, to, amountUSDC, reason, userAddress) {
  const advisory = engine.check(to, amountUSDC, userAddress);
  if (!advisory.allowed) {
    await appendFailure({ userAddress, to, amount: amountUSDC, reason, blockedReason: advisory.reason });
    return { success: false, reason: advisory.reason, code: advisory.code };
  }

  try {
    // P0-2: MUST go through the vault. Direct sendUSDC bypassed all on-chain
    // policy and is removed from the payment path. walletService.sendUSDC is
    // retained only for x402 facilitation where no vault exists for the payee.
    const { ethers } = require('ethers');
    const provider = new ethers.JsonRpcProvider(process.env.ARC_RPC, { chainId: 5042002, name: "arc-testnet" });
    const agentKey = process.env.PRIVATE_KEY;
    if (!agentKey) throw new Error('No agent key configured (PRIVATE_KEY)');
    const wallet = new ethers.Wallet(agentKey, provider);

    // EIP-712 sig-based execution — agent signs off-chain, vault verifies on-chain.
    // User never exposes a spend key; operator cannot unilaterally move funds.
    const vaultAddress = await escrow.findVault(userAddress);
    const sigPayload = await escrow.signExecute(vaultAddress, wallet, {
      user: userAddress,
      to,
      amount: amountUSDC,
      requestId: null,
      deadlineSec: 300
    });
    const receipt = await escrow.executePaymentWithSig(vaultAddress, wallet, {
      user: userAddress,
      to,
      amount: amountUSDC,
      requestId: ethers.ZeroHash,
      deadline: sigPayload.deadline,
      sig: sigPayload.sig
    });
    const txHash = receipt.hash || receipt.transactionHash;
    await appendSpend({ userAddress, to, amount: amountUSDC, reason, txHash, token: 'USDC' });
    return { success: true, txHash };
  } catch (err) {
    const reasonText = err.reason || err.shortMessage || err.message || 'unknown error';
    await appendFailure({ userAddress, to, amount: amountUSDC, reason, blockedReason: reasonText });

    // P2-12: if the vault reverted with a cap/whitelist violation, mirror it
    // into an on-chain emergency pause for this user to stop further attempts
    // until an operator resumes. Best-effort; failures here are non-fatal.
    if (/ExceedsDailyCap|ExceedsHourlyVelocity|ExceedsPerTxCap|NotWhitelisted|Too many/i.test(reasonText)) {
      try {
        const { ethers } = require('ethers');
        const provider = new ethers.JsonRpcProvider(process.env.ARC_RPC, { chainId: 5042002, name: "arc-testnet" });
        const agentWallet = new ethers.Wallet(process.env.PRIVATE_KEY, provider);
        await escrow.pauseUser(agentWallet, userAddress);
      } catch (_) { /* best-effort */ }
    }
    return { success: false, reason: reasonText };
  }
}

async function fetchAndPay(walletId, url, maxAmount, reason, userAddress) {
  const advisory = engine.check(url, maxAmount, userAddress);
  if (!advisory.allowed) {
    await appendFailure({ userAddress, to: url, amount: maxAmount, reason, blockedReason: advisory.reason });
    return { success: false, reason: advisory.reason, code: advisory.code };
  }

  try {
    // x402 paid fetch goes via the facilitator signer (raw USDC transfer); there
    // is no vault counterparty, so the advisory cap is the only enforcement.
    const isLocal = url.includes('localhost') || url.includes('127.0.0.1');
    const fetchOptions = isLocal ? {
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query: reason })
    } : {};
    const { data, actualAmount, actualPayTo } = await x402Client.fetchWithPayment(url, walletId, fetchOptions, userAddress);
    await appendSpend({ userAddress, to: actualPayTo || url, amount: actualAmount || maxAmount, reason, txHash: 'x402', token: 'USDC' });
    return { success: true, data, actualAmount };
  } catch (err) {
    await appendFailure({ userAddress, to: url, amount: maxAmount, reason, blockedReason: err.message });
    return { success: false, reason: err.message };
  }
}

async function getBalance(walletId) {
  return await walletService.getWalletBalance(walletId);
}

async function getSummary() {
  return engine.summary();
}

async function getUnifiedHistory(userAddress, limit = 50) {
  return await getHistory(userAddress, limit);
}

async function chat(message, walletId, userAddress) {
  const balance = await walletService.getWalletBalance(walletId);
  const address = await walletService.getWalletAddress(walletId);
  const intent = await parseIntent(message, address, balance);
  if (intent.action === "balance") {
    let vaultBalance = null;
    try {
      const escrow = require('./escrow');
      const { ethers } = require('ethers');
      const provider = new ethers.JsonRpcProvider(process.env.ARC_RPC, { chainId: 5042002, name: "arc-testnet" });
      const vaultAddr = await escrow.findVault(address);
      if (vaultAddr) {
        const onChain = await escrow.getOnChainPolicy(provider, address);
        vaultBalance = onChain.vaultBalance;
      }
    } catch (_) {}
    intent.message = "Your USDC balance is " + balance + " USDC" + (vaultBalance != null ? " (vault: " + vaultBalance + " USDC)" : "");
    intent.balance = balance;
    intent.address = address;
    intent.data = { balances: { USDC: balance }, vault: vaultBalance };
  }
  if (intent.action === "pools_status") {
    try {
      const poolStore = require('./poolStore');
      const pools = await poolStore.listPoolsForMember(address.toLowerCase());
      if (pools.length === 0) {
        intent.message = "You're not in any pools yet. Head to the Pools tab to create one or accept an invite.";
      } else {
        const names = pools.map(p => `"${p.name || p.poolId}" (${p.memberAddresses.length} members)`).join(', ');
        intent.message = `You're in ${pools.length} pool${pools.length === 1 ? '' : 's'}: ${names}. Open the Pools tab for balances and pending proposals.`;
      }
      intent.data = { pools };
    } catch (e) {
      intent.message = "Could not load your pools: " + e.message;
    }
  }
  if (intent.action === "jobs_status") {
    try {
      const jobIds = await getJobsCreatedBy(userAddress);
      const results = await Promise.allSettled(jobIds.map(id => jobService.getJob(id)));
      const jobs = results.filter(r => r.status === 'fulfilled').map(r => r.value);
      if (jobs.length === 0) {
        intent.message = "You haven't hired any agents yet. Try \"hire an agent to...\" or use the Jobs tab.";
      } else {
        const openCount = jobs.filter(j => j.status !== 'Completed' && j.status !== 'Rejected' && j.status !== 'Expired').length;
        intent.message = `You've hired ${jobs.length} agent job${jobs.length === 1 ? '' : 's'}, ${openCount} still open. See the Jobs tab for deliverables and status.`;
      }
      intent.data = { jobs };
    } catch (e) {
      intent.message = "Could not load your jobs: " + e.message;
    }
  }
  if (intent.action === "goals_status") {
    try {
      const intentEngine = require('./intentEngine');
      const plans = await intentEngine.listIntents(address);
      if (plans.length === 0) {
        intent.message = "No goals set yet. State one in the Goals tab, like \"pay 0xabc... 10 USDC once my balance is above 500\" or \"pay 0.1 USDC every day\" for something recurring.";
      } else {
        const active = plans.filter(p => p.status === 'active').length;
        intent.message = `You have ${plans.length} goal${plans.length === 1 ? '' : 's'}, ${active} still in progress. See the Goals tab for step-by-step status.`;
      }
      intent.data = { plans };
    } catch (e) {
      intent.message = "Could not load your goals: " + e.message;
    }
  }
  if (intent.action === "policy") {
    try {
      const escrow = require('./escrow');
      const { ethers } = require('ethers');
      const provider = new ethers.JsonRpcProvider(process.env.ARC_RPC, { chainId: 5042002, name: "arc-testnet" });
      const vaultAddr = await escrow.findVault(address);
      if (vaultAddr) {
        const onChain = await escrow.getOnChainPolicy(provider, address);
        intent.data = {
          perTxCap: onChain.perTxCap,
          dailyCap: onChain.dailyCap,
          dailySpendSoFar: onChain.todaySpent,
          dailyRemaining: Math.max(0, onChain.dailyCap - onChain.todaySpent),
          active: onChain.active
        };
        intent.message = "Spending policy: per-tx cap " + onChain.perTxCap + " USDC, daily cap " + onChain.dailyCap + " USDC, spent " + onChain.todaySpent + " USDC today.";
      } else {
        intent.message = "No vault policy set yet. Visit the Policy view to configure your caps.";
      }
    } catch (e) {
      intent.message = "Could not read on-chain policy: " + e.message;
    }
  }
  return intent;
}


const Groq = require('groq-sdk');
const groqCompound = new Groq({ apiKey: process.env.GROQ_API_KEY });

// Uses Groq's compound-mini model (built-in web search + code execution,
// server-side tool calls, no custom tool wiring needed) to actually perform
// a job's task and produce real deliverable text, instead of a placeholder.
const KERYX_BASE = 'https://keryxhq.xyz';

async function payKeryx(toolId, args) {
  const initial = await fetch(`${KERYX_BASE}/api/call`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ toolId, args })
  });
  if (initial.status !== 402) {
    return { data: await initial.json(), paid: false };
  }
  const challenge = await initial.json();
  const accept = challenge.accepts[0];

  const { ethers } = require('ethers');
  const provider = new ethers.JsonRpcProvider(process.env.ARC_RPC, { chainId: 5042002, name: 'arc-testnet' });
  const wallet = new ethers.Wallet(process.env.PRIVATE_KEY, provider);

  const nonce = ethers.hexlify(ethers.randomBytes(32));
  const validAfter = '0';
  const validBefore = String(Math.floor(Date.now() / 1000) + (accept.maxTimeoutSeconds || 60));

  const domain = {
    name: 'USDC',
    version: '2',
    chainId: 5042002,
    verifyingContract: accept.asset
  };
  const types = {
    TransferWithAuthorization: [
      { name: 'from', type: 'address' },
      { name: 'to', type: 'address' },
      { name: 'value', type: 'uint256' },
      { name: 'validAfter', type: 'uint256' },
      { name: 'validBefore', type: 'uint256' },
      { name: 'nonce', type: 'bytes32' }
    ]
  };
  const value = {
    from: await wallet.getAddress(),
    to: accept.payTo,
    value: accept.amount,
    validAfter,
    validBefore,
    nonce
  };

  const signature = await wallet.signTypedData(domain, types, value);

  const paymentPayload = {
    x402Version: challenge.x402Version,
    scheme: accept.scheme,
    network: accept.network,
    payload: { authorization: value, signature }
  };

  const paidRes = await fetch(`${KERYX_BASE}/api/call`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-PAYMENT': Buffer.from(JSON.stringify(paymentPayload)).toString('base64')
    },
    body: JSON.stringify({ toolId, args })
  });

  if (!paidRes.ok) {
    const body = await paidRes.text(); throw new Error(`Keryx payment failed: ${paidRes.status} - ${body}`);
  }

  return { data: await paidRes.json(), paid: true, amount: accept.amount };
}

const KERYX_KEYWORDS = {
  'crypto.trending': ['top coins', 'trending', 'top crypto', 'popular coins', 'hot coins'],
  'crypto.price': ['price of', 'crypto price', 'coin price', 'how much is'],
  'crypto.btc-dominance': ['btc dominance', 'market dominance', 'bitcoin dominance'],
  'weather.current': ['current weather', 'weather right now', 'weather today'],
  'weather.forecast': ['weather forecast', 'forecast for'],
  'finance.exchange-rates': ['exchange rate', 'exchange rates'],
  'finance.convert': ['convert', 'currency conversion'],
  'solana.token-activity': ['solana token', 'token trading data', 'dex pairs'],
  'solana.launches': ['new solana token', 'solana launches'],
  'solana.rug-check': ['rug check', 'rug risk', 'is this token safe'],
  'search.web': ['what is', 'who is', 'define', 'history of'],
  'web.hacker-news': ['hacker news', 'hn top'],
  'web.github-repo': ['github repo', 'github stars'],
  'geo.ip-lookup': ['ip lookup', 'geolocate ip'],
  'geo.country': ['country info', 'capital of'],
  'time.current': ['current time', 'what time is it'],
  'dns.domain-whois': ['whois', 'domain info'],
  'utility.qr': ['qr code'],
  'utility.uuid': ['generate uuid', 'unique id']
};

async function findKeryxTool(description) {
  try {
    const res = await fetch(`${KERYX_BASE}/api/tools`, { signal: AbortSignal.timeout(5000) });
    const { tools } = await res.json();
    const lower = description.toLowerCase();

    for (const [toolId, keywords] of Object.entries(KERYX_KEYWORDS)) {
      if (keywords.some(k => lower.includes(k))) {
        const match = tools.find(t => t.id === toolId);
        if (match) return match;
      }
    }

    return tools.find(t =>
      lower.includes(t.name.toLowerCase()) ||
      (t.summary && lower.split(' ').some(w => w.length > 4 && t.summary.toLowerCase().includes(w)))
    ) || null;
  } catch (e) {
    return null;
  }
}

async function performTask(description, walletId, userAddress) {
  try {
    const tool = walletId ? await findKeryxTool(description) : null;
    if (tool) {
      try {
        const keryxTimeout = new Promise((_, reject) => setTimeout(() => reject(new Error('Keryx call timeout')), 15000));
        const res = await Promise.race([
          payKeryx(tool.id, tool.sampleArgs || {}),
          keryxTimeout
        ]);
        return `${JSON.stringify(res.data)} (sourced live via Keryx tool "${tool.name}", paid ${res.amount || tool.priceUsd} USDC)`;
      } catch (e) {
        console.error('[performTask] Keryx call failed, falling back to Groq:', e.message);
      }
    }
    const completion = await groqCompound.chat.completions.create({
      messages: [
        { role: 'system', content: 'You are an autonomous agent completing a paid job. Research and answer concisely and factually. Your answer becomes the on-chain deliverable record for this job, so be accurate and brief.' },
        { role: 'user', content: description },
      ],
      model: 'openai/gpt-oss-120b',
      temperature: 0.2,
      max_tokens: 512,
    });
    return completion.choices[0]?.message?.content || 'Task completed — no content returned.';
  } catch (err) {
    return 'Task execution failed: ' + err.message;
  }
}

async function hireAgent(clientWalletId, providerWalletId, evaluatorWalletId, providerAddress, evaluatorAddress, description, budget, userAddress) {
  try {
    const { jobId, txHash: createTxHash } = await jobService.createJob(clientWalletId, providerAddress, evaluatorAddress, description);
    await jobService.setBudget(providerWalletId, jobId, budget);
    const fundTxHash = await jobService.approveAndFund(clientWalletId, jobId, budget);

    await appendSpend({ userAddress, to: providerAddress, amount: budget, reason: description, txHash: fundTxHash, token: 'USDC', jobId, type: 'job_hire' });

    return { success: true, jobId, status: 'Funded', createTxHash, fundTxHash };
  } catch (err) {
    await appendFailure({ userAddress, to: providerAddress, amount: budget, reason: description, blockedReason: err.message });
    return { success: false, reason: err.message };
  }
}

async function completeHiredJob(evaluatorWalletId, jobId, providerWalletId, deliverableText) {
  const job = await jobService.getJob(jobId);
  if (!deliverableText || deliverableText === 'work completed') {
    deliverableText = await performTask(job.description, providerWalletId, job.client);
  }
  const { txHash: submitTxHash } = await jobService.submitDeliverable(providerWalletId, jobId, deliverableText);
  const completeTxHash = await jobService.completeJob(evaluatorWalletId, jobId);

  try {
    await appendSpend({
      userAddress: job.client,
      to: job.provider,
      amount: job.budget,
      reason: job.description,
      txHash: completeTxHash,
      jobId,
      type: 'job_deliverable',
      deliverableText
    });
  } catch (err) {
    console.error('[completeHiredJob] Failed to persist deliverable text:', err.message);
  }

  return { success: true, submitTxHash, completeTxHash, job, deliverableText };
}

module.exports = { pay, fetchAndPay, getBalance, getSummary, getUnifiedHistory, chat, hireAgent, completeHiredJob, performTask };
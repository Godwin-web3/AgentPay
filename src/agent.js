require('dotenv').config();
const PolicyEngine = require('./policyEngine');
const walletService = require('./walletService');
const x402Client = require('./x402Client');
const escrow = require('./escrow');
const { appendSpend, appendFailure, getHistory, getJobsCreatedBy } = require('./spendStore');
const { parseIntent } = require('./brain');
const jobService = require('./jobService');
const { fromUnits } = require('../utils/usdc');

// P1-7: off-chain PolicyEngine is now an ADVISORY pre-check only. The
// authoritative decision lives in AgentVault.execute (per-tx/daily/hourly caps,
// whitelist) invoked via escrow.executePayment. Failing the advisory check
// short-circuits before spending gas, but an advisory pass is NOT a guarantee —
// the vault may still revert on chain.
const engine = new PolicyEngine();

// Mirrors src/server.js's getAgentWallet()/resolveInvite() — needed here too
// since pool actions reachable from Terminal chat sign the same way pool
// actions reachable from the Pools tab do (agent-signed proposeSpend, member
// @tag resolution via walletStore).
function getAgentWallet() {
  const { ethers } = require('ethers');
  const provider = new ethers.JsonRpcProvider(process.env.ARC_RPC, { chainId: 5042002, name: 'arc-testnet' });
  return new ethers.Wallet(process.env.PRIVATE_KEY, provider);
}

async function resolveAddressOrTag(raw) {
  if (typeof raw === 'string' && raw.startsWith('0x')) return raw;
  const walletStore = require('./walletStore');
  const tag = String(raw).replace('@', '').toLowerCase();
  const entry = await walletStore.findByTag(tag);
  if (!entry) throw new Error(`Could not resolve "${raw}" — not a known @tag or address`);
  return entry.address;
}

async function resolvePoolByName(memberAddress, poolName) {
  const poolStore = require('./poolStore');
  const pools = await poolStore.listPoolsForMember(memberAddress.toLowerCase());
  if (pools.length === 0) throw new Error("you're not in any pools yet — create one in the Pools tab first");
  if (!poolName) {
    if (pools.length === 1) return pools[0];
    throw new Error(`which pool? you're in: ${pools.map(p => p.name).join(', ')}`);
  }
  const lower = poolName.toLowerCase();
  const match = pools.find(p => p.name && p.name.toLowerCase() === lower) ||
    pools.find(p => p.name && p.name.toLowerCase().includes(lower));
  if (!match) throw new Error(`couldn't find a pool named "${poolName}" among yours: ${pools.map(p => p.name).join(', ')}`);
  return match;
}

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
    const { data, actualAmount, actualTxHash } = await x402Client.fetchWithPayment(url, walletId, fetchOptions, userAddress);
    await appendSpend({ userAddress, to: url, amount: Number(actualAmount) || maxAmount, reason, txHash: actualTxHash, token: 'USDC', type: 'x402_fetch' });
    return { success: true, data, actualAmount, txHash: actualTxHash };
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
  if (intent.action === "create_pool") {
    try {
      const poolBrain = require('./poolBrain');
      const poolVault = require('./poolVault');
      const poolStore = require('./poolStore');
      const draft = await poolBrain.parsePoolCreation(intent.description || message);
      const resolvedInvites = await Promise.all(draft.invites.map(resolveAddressOrTag));
      const { poolId, txHash } = await poolVault.createPool(walletId, resolvedInvites, draft.constitution);
      await poolStore.createPoolMeta({ poolId, name: draft.name, founderAddress: address, memberAddresses: [address, ...resolvedInvites] });
      intent.message = `Created pool "${draft.name}" with ${resolvedInvites.length} invite${resolvedInvites.length === 1 ? '' : 's'}. Find it in the Pools tab.`;
      intent.data = { poolId, txHash, name: draft.name };
    } catch (e) {
      intent.message = "Could not create that pool: " + e.message;
    }
  }
  if (intent.action === "pool_contribute") {
    try {
      const poolVault = require('./poolVault');
      const pool = await resolvePoolByName(address, intent.poolName);
      const toShared = intent.toShared !== false;
      const txHash = await poolVault.contribute(walletId, pool.poolId, intent.amount, toShared);
      await appendSpend({ userAddress: address, to: `pool:${pool.poolId}`, amount: Number(intent.amount), reason: toShared ? 'Pool contribution (shared)' : 'Pool contribution (personal)', txHash, token: 'USDC', type: 'pool_contribute' });
      intent.message = `Contributed ${intent.amount} USDC to "${pool.name}" (${toShared ? 'shared' : 'personal'} balance).`;
      intent.data = { poolId: pool.poolId, txHash };
    } catch (e) {
      intent.message = "Could not contribute to that pool: " + e.message;
    }
  }
  if (intent.action === "pool_propose_spend") {
    try {
      const poolVault = require('./poolVault');
      const poolStore = require('./poolStore');
      const pool = await resolvePoolByName(address, intent.poolName);
      const to = await resolveAddressOrTag(intent.to);
      intent.to = to; // pre-resolved — keeps handleChat's generic @tag pass a no-op
      const { proposalId, txHash } = await poolVault.proposeSpend(getAgentWallet(), pool.poolId, address, to, intent.amount, intent.reason || '');
      const { ethers } = require('ethers');
      const provider = new ethers.JsonRpcProvider(process.env.ARC_RPC, { chainId: 5042002, name: 'arc-testnet' });
      const onChainProposal = await poolVault.getProposal(provider, proposalId);
      await poolStore.recordProposal({ proposalId, poolId: pool.poolId, kind: 'Spend', windowEnds: onChainProposal.windowEnds, proposer: address });
      if (onChainProposal.resolved) {
        await poolStore.closeProposal(proposalId, { resolved: 'executed', txHash });
        await appendSpend({ userAddress: address, to, amount: Number(intent.amount), reason: intent.reason || 'Pool spend', txHash, token: 'USDC', type: 'pool_spend' });
        intent.message = `Spent ${intent.amount} USDC from "${pool.name}" — under the discretionary threshold, so it executed immediately.`;
      } else {
        const hoursLeft = onChainProposal.windowEnds ? Math.max(0, Math.round((onChainProposal.windowEnds * 1000 - Date.now()) / 3600000)) : null;
        intent.message = `Proposed spending ${intent.amount} USDC from "${pool.name}". Other members have ${hoursLeft != null ? hoursLeft + 'h' : 'the objection window'} to veto before it executes.`;
      }
      intent.data = { poolId: pool.poolId, proposalId, txHash };
    } catch (e) {
      intent.message = "Could not propose that spend: " + e.message;
    }
  }
  if (intent.action === "fetch_paid_data") {
    try {
      const paid = await payForLiveData(intent.description || message, walletId, address);
      if (paid) {
        const answer = await summarizePaidResult(intent.description || message, paid.result);
        intent.message = `${answer}\n\n(paid ${paid.amount} USDC via x402 for live data from "${paid.tool.name}")`;
        intent.data = { x402: true, tool: paid.tool.name, amount: paid.amount, txHash: paid.txHash, result: paid.result };
      }
      // else: no matching paid source for this — intent.message already
      // carries brain.js's best-guess answer, so there's nothing to overwrite.
    } catch (e) {
      console.error('[chat] fetch_paid_data failed, falling back to best-guess answer:', e.message);
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

  const body = await paidRes.json();
  // Keryx's documented paid-response shape includes settlement.txHash — best
  // effort, since it isn't guaranteed to be populated the same way across
  // every publisher's tool.
  const txHash = body?.settlement?.txHash || null;
  return { data: body, paid: true, amount: fromUnits(accept.amount), txHash };
}

// Picks the best-matching Keryx tool for a request using the model over the
// full live catalog, rather than a hand-maintained keyword table. The prior
// keyword table's fallback did naive substring matching against each tool's
// summary text — which meant "get me the current ETH price" matched
// "Wikipedia Grounded Search" because that tool's own summary says "NOT for
// prices...", and ".includes('price')" doesn't know the difference.
async function findKeryxTool(description) {
  try {
    const res = await fetch(`${KERYX_BASE}/api/tools`, { signal: AbortSignal.timeout(5000) });
    const { tools } = await res.json();
    if (!tools || tools.length === 0) return null;

    const catalog = tools.map(t => `- ${t.id}: ${t.name} — ${t.summary}`).join('\n');
    const completion = await groqCompound.chat.completions.create({
      messages: [
        { role: 'system', content: `Pick the single best-matching tool id for the user's request from this catalog. Respond with ONLY the tool id, or the word none if nothing genuinely fits — do not force a match.\n${catalog}` },
        { role: 'user', content: description },
      ],
      model: 'openai/gpt-oss-120b',
      temperature: 0,
      max_tokens: 20,
    });
    const pickedId = (completion.choices[0]?.message?.content || '').trim().replace(/["'.]/g, '');
    if (!pickedId || pickedId.toLowerCase() === 'none') return null;
    return tools.find(t => t.id === pickedId) || null;
  } catch (e) {
    return null;
  }
}

// Fills a matched tool's actual argument schema from the user's request,
// instead of always calling with the tool's canned sampleArgs (the previous
// behavior — it meant "what's the weather in Lagos" silently paid for and
// returned New York's weather, since weather.current's sample lat/lon is
// NYC's, and the args were never actually replaced with what was asked).
async function resolveToolArgs(tool, description) {
  const argEntries = Object.entries(tool.args || {});
  if (argEntries.length === 0) return {};
  const schema = argEntries.map(([name, spec]) =>
    `- ${name} (${spec.type}${spec.required ? ', required' : ''}): ${spec.description || ''}`
  ).join('\n');
  try {
    const completion = await groqCompound.chat.completions.create({
      messages: [
        { role: 'system', content: `Extract arguments for a tool call from the user's request.\nTool: "${tool.name}" — ${tool.summary}\nArguments:\n${schema}\nRespond with ONLY a JSON object mapping argument names to values found in the request. Omit any argument not mentioned — do not guess or invent a value.` },
        { role: 'user', content: description },
      ],
      model: 'openai/gpt-oss-120b',
      temperature: 0,
      max_tokens: 200,
    });
    const cleaned = (completion.choices[0]?.message?.content || '{}').replace(/```json|```/g, '').trim();
    const extracted = JSON.parse(cleaned);
    // Sample args fill in anything the user didn't mention (still needed for
    // required fields), extracted values override them where present.
    return { ...(tool.sampleArgs || {}), ...extracted };
  } catch (e) {
    console.error('[resolveToolArgs] extraction failed, using sample args:', e.message);
    return tool.sampleArgs || {};
  }
}

// One-sentence natural-language answer from a paid tool's raw JSON result —
// callers previously dumped the entire response (tool metadata, quote,
// settlement info and all) straight into the chat/deliverable text.
async function summarizePaidResult(description, resultData) {
  try {
    const completion = await groqCompound.chat.completions.create({
      messages: [
        { role: 'system', content: 'Answer the question in one or two plain sentences using ONLY the JSON data given. No meta-commentary about the data format, no mention of JSON.' },
        { role: 'user', content: `Question: ${description}\nData: ${JSON.stringify(resultData)}` },
      ],
      model: 'openai/gpt-oss-120b',
      temperature: 0.2,
      max_tokens: 200,
    });
    return completion.choices[0]?.message?.content?.trim() || JSON.stringify(resultData);
  } catch (e) {
    return JSON.stringify(resultData);
  }
}

// Shared by performTask (job deliverables) and the "fetch_paid_data" chat
// action — finds a matching Keryx tool, pays for it via x402, and logs the
// spend. Returns null (not a throw) when no tool matches, so callers can
// fall back to an ungrounded answer without special-casing "not found".
async function payForLiveData(description, walletId, userAddress) {
  const tool = walletId ? await findKeryxTool(description) : null;
  if (!tool) return null;
  const args = await resolveToolArgs(tool, description);
  const keryxTimeout = new Promise((_, reject) => setTimeout(() => reject(new Error('Keryx call timeout')), 15000));
  const res = await Promise.race([
    payKeryx(tool.id, args),
    keryxTimeout
  ]);
  const paidAmount = res.amount || tool.priceUsd;
  // This data-purchase cost was previously untracked entirely — nothing
  // recorded it as spend anywhere. Log it so the real x402 payment is
  // visible in History, not just implied by the answer text.
  if (userAddress) {
    await appendSpend({ userAddress, to: tool.publisherWallet || 'keryx', amount: paidAmount, reason: `Paid data: ${tool.name}`, txHash: res.txHash, token: 'USDC', type: 'x402_fetch' });
  }
  // res.data is the full paid-response envelope (tool metadata, quote,
  // settlement info); `result` is the part actually worth showing a user.
  return { data: res.data, result: res.data?.result ?? res.data, tool, amount: paidAmount, txHash: res.txHash };
}

async function performTask(description, walletId, userAddress) {
  try {
    const paid = await payForLiveData(description, walletId, userAddress).catch(e => {
      console.error('[performTask] Keryx call failed, falling back to Groq:', e.message);
      return null;
    });
    if (paid) {
      const answer = await summarizePaidResult(description, paid.result);
      return `${answer} (sourced live via Keryx tool "${paid.tool.name}", paid ${paid.amount} USDC)`;
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
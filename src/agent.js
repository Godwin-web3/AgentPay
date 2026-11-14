require('dotenv').config();
const PolicyEngine = require('./policyEngine');
const walletService = require('./walletService');
const x402Client = require('./x402Client');
const escrow = require('./escrow');
const { appendSpend, appendFailure, getHistory } = require('./spendStore');
const { parseIntent } = require('./brain');
const { fromUnits } = require('../utils/usdc');

// P1-7: off-chain PolicyEngine is now an ADVISORY pre-check only. The
// authoritative decision lives in AgentVault.execute (per-tx/daily/hourly caps,
// whitelist) invoked via escrow.executePayment. Failing the advisory check
// short-circuits before spending gas, but an advisory pass is NOT a guarantee —
// the vault may still revert on chain.
const engine = new PolicyEngine();
const { getProvider, getChain } = require('./chain');

// Mirrors src/server.js's getAgentWallet()/resolveInvite() — needed here too
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
    const provider = getProvider();
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
        const provider = getProvider();
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

async function chat(message, walletId, userId) {
  const record = await require('./walletStore').getWallet(userId);
  let address = record && record.address;
  let balance = '0.00';
  if (!address && walletId) {
    address = await walletService.getWalletAddress(walletId);
  }
  if (walletId) {
    try { balance = await walletService.getWalletBalance(walletId); } catch (_) {}
  }
  const intent = await parseIntent(message, address, balance);
  if (intent.action === "balance") {
    let vaultBalance = null;
    try {
      const escrow = require('./escrow');
      const { ethers } = require('ethers');
      const provider = getProvider();
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
    try {
      const record = await require('./walletStore').getWallet(userId);
      const baseAddress = address || (record && record.address);
      if (baseAddress) {
        const pos = await require('./baseBalance').readBasePosition(baseAddress);
        if (pos) {
          const vaultAmt = Number(pos.vault).toFixed(2);
          const walletAmt = Number(pos.wallet).toFixed(2);
          intent.message = "Base Sepolia: " + walletAmt + " USDC in the wallet, " + Number(pos.eth).toFixed(4) + " ETH. Vault: " + vaultAmt + ".";
          intent.data = {
            balances: {
              'Base Sepolia wallet': walletAmt,
              'Base Sepolia ETH': pos.eth,
              'Base Sepolia vault': vaultAmt,
            },
            vault: vaultAmt,
          };
        }
      }
      const hood = await require('./robinhoodBalance').readRobinhoodPosition(baseAddress);
      if (hood) {
        const lines = hood.tokens.map((token) => token.symbol + ' ' + token.amount).join(', ');
        intent.message += ' Robinhood testnet: ' + hood.eth + ' ETH, vault ' + hood.vault + ' ' + hood.token + ', wallet ' + lines + '.';
        intent.data.balances['Robinhood ETH'] = hood.eth;
        intent.data.balances['Robinhood vault'] = hood.vault + ' TSLA';
        for (const token of hood.tokens) intent.data.balances['Robinhood ' + token.symbol] = token.amount;
      }
    } catch (err) {
      console.error('[balance] base:', err.message);
    }
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
  if (intent.action === "swap") {
    try {
      const { quoteSwap } = require('./swap');
      const quote = await quoteSwap({
        chain: intent.chain,
        fromAsset: intent.fromAsset || intent.from,
        toAsset: intent.toAsset || 'ETH',
        amount: intent.amount,
      });
      intent.data = { quote };
      intent.chain = quote.chain;
      intent.fromAsset = quote.from;
      intent.toAsset = quote.to;
      intent.amount = quote.amountIn;
      intent.message = `Swap ${quote.amountIn} ${quote.from} for about ${quote.amountOut} ${quote.to} on ${quote.chainName}. Confirm to send it through the vault.`;
    } catch (e) {
      intent.data = { quoteError: e.message };
      intent.message = e.message;
    }
  }
  if (intent.action === "bridge") {
    try {
      const { quoteBridge } = require('./bridge');
      const quote = await quoteBridge({
        from: intent.fromChain || intent.from || 'base',
        to: intent.toChain || intent.to || 'arc',
        amount: intent.amount,
      });
      intent.data = { quote };
      intent.message = `Bridge ${quote.amount} USDC from ${quote.fromName} to ${quote.toName}. Fast transfer, so Circle attests after confirmation instead of waiting for finality. Fee is about ${quote.fee} USDC. Confirm to start.`;
    } catch (e) {
      intent.data = { quoteError: e.message };
      intent.message = e.message;
    }
  }
  if (intent.action === "bridge_complete") {
    try {
      const { completeBridge } = require('./bridge');
      const done = await completeBridge(userAddress);
      intent.data = { result: done };
      intent.message = `Minted ${done.amount} USDC on ${done.toChain}. ${done.mintTx}`;
    } catch (e) {
      intent.message = e.message;
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
      const pool = await resolvePoolByName(address, intent.poolName);
      const to = await resolveAddressOrTag(intent.to);
      intent.to = to;
      const provider = getProvider();
      const deadline = Math.floor(Date.now() / 1000) + 60 * 60;
      const typedData = await poolVault.spendTypedData(provider, {
        poolId: pool.poolId, proposer: address, to, amount: intent.amount, reason: intent.reason || '', deadline,
      });
      intent.message = `Sign to propose ${intent.amount} USDC from "${pool.name}". Nothing moves until you sign, and the objection window still has to pass.`;
      intent.data = { poolId: pool.poolId, signatureRequest: { action: 'propose_spend', typedData, submit: { to, amount: intent.amount, reason: intent.reason || '' } } };
    } catch (e) {
      intent.message = "Could not propose that spend: " + e.message;
    }
  }
  if (intent.action === "fetch_paid_data") {
    // Deliberately surfaces *why* this fell back instead of silently keeping
    // brain.js's guessed answer — a silent catch here previously made a real
    // bug (findKeryxTool never matching anything) look identical to "there's
    // just no paid source for this," with no way to tell them apart from
    // the chat transcript alone.
    try {
      const paid = await payForLiveData(intent.description || message, walletId, address);
      if (paid) {
        const answer = await summarizePaidResult(intent.description || message, paid.result);
        intent.message = `${answer}\n\n(paid ${paid.amount} USDC via x402 for live data from "${paid.tool.name}")`;
        intent.data = { x402: true, tool: paid.tool.name, amount: paid.amount, txHash: paid.txHash, result: paid.result };
      } else {
        intent.message = `${intent.message}\n\n[no live paid data source matched this request]`;
      }
    } catch (e) {
      console.error('[chat] fetch_paid_data failed:', e.message);
      intent.message = `${intent.message}\n\n[live data lookup failed: ${e.message}]`;
    }
  }
  if (intent.action === "policy") {
    try {
      const escrow = require('./escrow');
      const { ethers } = require('ethers');
      const provider = getProvider();
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
  const provider = getProvider();
  const wallet = new ethers.Wallet(process.env.PRIVATE_KEY, provider);

  const nonce = ethers.hexlify(ethers.randomBytes(32));
  const validAfter = '0';
  const validBefore = String(Math.floor(Date.now() / 1000) + (accept.maxTimeoutSeconds || 60));

  const domain = {
    name: 'USDC',
    version: '2',
    chainId: getChain().chainId,
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
// Does NOT swallow errors internally — a network failure fetching the
// catalog or calling Groq propagates to the caller instead of silently
// becoming "no match", which is what made an earlier bug here (stripped
// periods corrupting every tool id) indistinguishable from "nothing fits"
// or "Keryx is unreachable" purely from what the user saw in chat.
// Returns { tool, raw } — `raw` is always populated (even on a clean "none"
// decision or a failed match) so callers can surface exactly what the model
// said, rather than every "no match" outcome looking identical from the
// outside regardless of whether it was a deliberate decision or a bug.
async function findKeryxTool(description) {
  const res = await fetch(`${KERYX_BASE}/api/tools`, { signal: AbortSignal.timeout(8000) });
  if (!res.ok) throw new Error(`Keryx tool catalog fetch failed: ${res.status}`);
  const { tools } = await res.json();
  if (!tools || tools.length === 0) return { tool: null, raw: '(empty catalog)' };

  const catalog = tools.map(t => `- ${t.id}: ${t.name} — ${t.summary}`).join('\n');
  const completion = await groqCompound.chat.completions.create({
    messages: [
      { role: 'system', content: `Pick the single best-matching tool id for the user's request from this catalog. Respond with ONLY the tool id, or the word none if nothing genuinely fits — do not force a match.\n${catalog}` },
      { role: 'user', content: description },
    ],
    model: 'openai/gpt-oss-120b',
    temperature: 0,
    max_tokens: 300,
    // gpt-oss-120b is a reasoning model (defaults to 'medium' effort) whose
    // reasoning tokens count against max_tokens before the answer is ever
    // emitted — a low budget here previously got consumed entirely by
    // hidden reasoning, leaving an empty response that looked identical to
    // "no tool matched." 'low' effort + hidden reasoning format keeps this
    // classification-sized task from starving itself.
    reasoning_effort: 'low',
    reasoning_format: 'hidden',
  });
  // Trim wrapping quotes/backticks only — do NOT strip periods, since every
  // real tool id is dotted ("weather.current", "crypto.price"); a prior
  // version stripped them and corrupted every id, so this never matched
  // anything, ever, regardless of what the model picked.
  const rawContent = (completion.choices[0]?.message?.content || '').trim();
  const cleaned = rawContent.replace(/^["'`]+|["'`]+$/g, '');
  if (!cleaned || /^none\b/i.test(cleaned)) return { tool: null, raw: rawContent || '(empty response)' };
  // Exact match first, then fall back to "the id appears somewhere in the
  // response" in case the model added any surrounding text despite the
  // "ONLY the tool id" instruction.
  const match = tools.find(t => t.id === cleaned) || tools.find(t => cleaned.includes(t.id)) || null;
  return { tool: match, raw: rawContent };
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
      max_tokens: 400,
      reasoning_effort: 'low',
      reasoning_format: 'hidden',
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
      max_tokens: 400,
      reasoning_effort: 'low',
      reasoning_format: 'hidden',
    });
    return completion.choices[0]?.message?.content?.trim() || JSON.stringify(resultData);
  } catch (e) {
    return JSON.stringify(resultData);
  }
}

module.exports = { pay, fetchAndPay, getBalance, getSummary, getUnifiedHistory, chat };

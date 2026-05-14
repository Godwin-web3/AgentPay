require('dotenv').config();
const { SomniaAgentKit, SOMNIA_NETWORKS } = require('somnia-agent-kit');
const { ethers } = require('ethers');
const PolicyEngine = require('./policyEngine');
const { appendSpend, appendFailure, appendSwap, getHistory } = require('../utils/store');
const { directSend, setPolicy } = require('./escrow');
const { estimateSwap, executeSwap, TOKENS } = require('./dex');

let kit = null;
let engine = null;
let agentId = null;
let wallet = null;

async function init() {
  const provider = new ethers.JsonRpcProvider(process.env.SOMNIA_RPC_URL);
  wallet = new ethers.Wallet(process.env.PRIVATE_KEY, provider);

  kit = new SomniaAgentKit({
    network: SOMNIA_NETWORKS.testnet,
    privateKey: process.env.PRIVATE_KEY,
    contracts: {
      agentRegistry: process.env.AGENT_REGISTRY_ADDRESS,
      agentManager:  process.env.AGENT_MANAGER_ADDRESS,
      agentExecutor: process.env.AGENT_EXECUTOR_ADDRESS,
      agentVault:    process.env.AGENT_VAULT_ADDRESS,
    }
  });

  await kit.initialize();
  engine = new PolicyEngine();

  const address = await wallet.getAddress();
  const balance = await provider.getBalance(address);

  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('🛡️  AgentPay — Agentic Payment Layer');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('👛 Wallet:  ' + address);
  console.log('💰 Balance: ' + parseFloat(ethers.formatEther(balance)).toFixed(4) + ' STT');

  return { kit, engine, wallet, address };
}

async function prepareSwap(fromToken, toToken, amount) {
  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('🔄 Swap Estimation');
  console.log('   From:   ' + fromToken);
  console.log('   To:     ' + toToken);
  console.log('   Amount: ' + amount);

  const estimation = await estimateSwap(wallet, fromToken, toToken, amount);
  if (estimation.success) {
    console.log('\n📊 Estimation Results');
    console.log('   Expected: ' + estimation.expectedOut);
    console.log('   Gas Fee:  ' + estimation.estGasCost + ' STT');
  } else {
    console.log('\n❌ Estimation failed: ' + (estimation.error ? estimation.error.slice(0, 100) : 'Unknown error'));
  }
  return estimation;
}

async function confirmSwap(fromToken, toToken, amount) {
  console.log('\n🚀 Executing Swap...');
  const result = await executeSwap(wallet, fromToken, toToken, amount);
  
  if (result.success) {
    console.log('\n✅ Swap successful!');
    console.log('   TX: ' + result.txHash);
    console.log('   🔗 https://explorer.somnia.network/tx/' + result.txHash);
    const _rev = {}; Object.entries(TOKENS).forEach(([s,a]) => { _rev[a.toLowerCase()] = s; }); appendSwap({ fromToken: _rev[fromToken.toLowerCase()] || fromToken, toToken: _rev[toToken.toLowerCase()] || toToken, amount, txHash: result.txHash });
  } else {
    console.log('\n❌ Swap failed: ' + (result.error ? result.error.slice(0, 100) : 'Unknown error'));
  }
  return result;
}

async function registerAgent() {
  const agentName = process.env.AGENT_NAME || ('AgentPay-' + (await wallet.getAddress()).slice(0, 8));
  let _agentNameRef = agentName;
  console.log('\n📝 Registering ' + agentName + ' on Somnia...');
  try {
    const tx = await kit.contracts.registry.registerAgent(
      agentName,
      'Policy-enforced agentic payment layer for Somnia users',
      'ipfs://agentpay-v1',
      ['payments', 'policy', 'guard', 'defi']
    );
    const receipt = await tx.wait();

    const event = receipt.logs.find(
      (log) =>
        log.topics[0] ===
        kit.contracts.registry.interface.getEvent('AgentRegistered').topicHash
    );

    if (event) {
      const parsed = kit.contracts.registry.interface.parseLog(event);
      agentId = parsed?.args.agentId;
      console.log('✅ AgentPay registered on-chain');
      console.log('   Agent ID: ' + agentId.toString());
      console.log('   TX: https://explorer.somnia.network/tx/' + receipt.hash);
    }

    return agentId;
  } catch (err) {
    if (err.message.includes('already') || err.message.includes('0x03')) {
      console.log('ℹ️  ' + _agentNameRef + ' already registered');
    } else {
      console.log('⚠️  Registration error: ' + err.message.slice(0, 80));
    }
  }
}

async function pay(to, amountSTT, reason) {
  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('📨 Payment Request');
  console.log('   To:     ' + to);
  console.log('   Amount: ' + amountSTT + ' STT');
  console.log('   Reason: ' + reason);

  const decision = engine.check(to, amountSTT, reason);

  console.log('\n🔎 Policy Decision: ' + (decision.allowed ? '✅ APPROVED' : '❌ BLOCKED'));
  console.log('   ' + decision.reason);

  if (!decision.allowed) {
    appendFailure({ to, amount: amountSTT, reason, blockedReason: decision.reason, agentId });
    return { success: false, reason: decision.reason, code: decision.code };
  }

  try {
    const receipt = await directSend(wallet, to, amountSTT);

    console.log('\n💸 Transferred ' + amountSTT + ' STT via escrow contract');
    console.log('   TX:  ' + receipt.hash);
    console.log('   🔗  https://explorer.somnia.network/tx/' + receipt.hash);

    if (decision.meta) {
      console.log('\n📊 Spend Status');
      console.log('   Today:     ' + decision.meta.todaySpend + ' / ' + engine.policy.dailyCapSTT + ' STT');
      console.log('   Remaining: ' + decision.meta.dailyRemaining + ' STT');
      console.log('   Hourly tx: ' + decision.meta.hourlyTxCount + ' / ' + engine.policy.circuitBreaker.maxTxPerHour);
    }

    appendSpend({ to, amount: amountSTT, reason, txHash: receipt.hash, agentId });
    return { success: true, txHash: receipt.hash };
  } catch (err) {
    console.log('\n❌ Transfer failed: ' + err.message.slice(0, 100));
    appendFailure({ to, amount: amountSTT, reason, blockedReason: err.message, agentId });
    return { success: false, reason: err.message };
  }
}

async function setupEscrowPolicy() {
  console.log('\n📋 Setting policy onchain...');
  try {
    await setPolicy(
      wallet,
      engine.policy.perTxCapSTT,
      engine.policy.dailyCapSTT,
      engine.policy.circuitBreaker.maxTxPerHour,
      engine.policy.allowedRecipients
    );
  } catch (err) {
    console.log('⚠️  Policy setup error: ' + err.message.slice(0, 80));
  }
}

function history() {
  const logs = getHistory(10);
  console.log('\n📋 Recent Activity (last 10)');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  if (logs.length === 0) {
    console.log('   No activity yet');
    return;
  }
  logs.forEach(function(entry) {
    const time = new Date(entry.timestamp).toLocaleTimeString();
    if (entry.type === 'swap') {
      console.log('🔄 [' + time + '] ' + entry.amount + ' ' + entry.fromToken + ' → ' + entry.toToken);
      if (entry.txHash) console.log('   TX: ' + entry.txHash.slice(0, 20) + '...');
    } else {
      const status = entry.failed ? '❌' : '✅';
      console.log(status + ' [' + time + '] ' + entry.amount + ' STT → ' + (entry.to ? entry.to.slice(0, 10) : '?') + '... (' + (entry.reason || '') + ')');
      if (entry.failed) console.log('   Blocked: ' + (entry.blockedReason ? entry.blockedReason.slice(0, 60) : ''));
      if (entry.txHash) console.log('   TX: ' + entry.txHash.slice(0, 20) + '...');
    }
  });
}

function status() {
  const summary = engine.summary();
  console.log('\n📊 AgentPay Status');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('   Agent:         ' + summary.agentName);
  console.log('   Daily cap:     ' + summary.dailyCapSTT + ' STT');
  console.log('   Spent today:   ' + summary.todaySpent + ' STT');
  console.log('   Remaining:     ' + summary.dailyRemaining + ' STT');
  console.log('   Per-tx cap:    ' + summary.perTxCapSTT + ' STT');
  console.log('   Hourly tx:     ' + summary.hourlyTxCount + '/' + summary.maxTxPerHour);
  console.log('   Active hours:  ' + summary.activeHours);
  if (summary.whitelistCount === 0) {
    console.log('   Whitelist:     open (no restrictions)');
  } else {
    console.log('   Whitelist:     ' + summary.whitelistCount + ' address(es):');
    summary.whitelist.forEach(function(a) { console.log('                  ' + a); });
  }
  console.log('   Paused:        ' + (summary.isPaused ? '🔴 YES' : '🟢 NO'));
}

module.exports = { init, registerAgent, pay, setupEscrowPolicy, history, status, prepareSwap, confirmSwap };

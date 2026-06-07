require('dotenv').config();
const { SomniaAgentKit, SOMNIA_NETWORKS } = require('somnia-agent-kit');
const { ethers } = require('ethers');
const PolicyEngine = require('./policyEngine');
const { appendSpend, appendFailure, appendSwap, appendInference, getHistory } = require('../utils/store');
const { executePayment, setPolicy, TOKENS, getVaultContract } = require('./escrow');
const { estimateSwap, executeSwap } = require('./dex');
const { parseIntent, parseIntentOnChain } = require('./brain');
const { getAllJobs, addJob, cancelJob, parseInterval, intervalLabel } = require('./scheduler');

let kit = null;
let engine = null;
let agentId = null;
let wallet = null;
let provider = null;

async function init() {
  provider = new ethers.JsonRpcProvider(process.env.SOMNIA_RPC_URL);
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
  
  const address = await wallet.getAddress();
  engine = new PolicyEngine(wallet);

  const balance = await provider.getBalance(address);

  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('🛡️  AgentPay — Agentic Payment Layer');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('👛 Wallet:  ' + address);
  
  const ERC20_ABI = ['function balanceOf(address) external view returns (uint256)'];
  const tokenBalances = await Promise.all(
    Object.entries(TOKENS).map(async ([symbol, addr]) => {
      if (addr === ethers.ZeroAddress) return { symbol, bal: balance };
      try {
        const contract = new ethers.Contract(addr, ERC20_ABI, provider);
        return { symbol, bal: await contract.balanceOf(address) };
      } catch {
        return { symbol, bal: 0n };
      }
    })
  );

  console.log('💰 Balances:');
  tokenBalances.forEach(({ symbol, bal }) => {
    console.log(`   ${symbol}:  ${parseFloat(ethers.formatEther(bal)).toFixed(4)}`);
  });

  return { kit, engine, wallet, address };
}

async function prepareSwap(fromToken, toToken, amount) {
  return await estimateSwap(wallet, fromToken, toToken, amount);
}

async function confirmSwap(fromToken, toToken, amount) {
  const result = await executeSwap(wallet, fromToken, toToken, amount);
  if (result.success) {
    appendSwap({ fromToken, toToken, amount, txHash: result.txHash });
  }
  return result;
}

async function registerAgent() {
  try {
    const address = await wallet.getAddress();
    const existing = await kit.contracts.registry.getOwnerAgents(address);
    if (existing && existing.length > 0) {
      agentId = existing[0];
      console.log(`🤖 Somnia Agent Identity Linked: ID ${agentId}`);
      return agentId;
    }
  } catch (err) {
    console.warn('⚠️  Could not fetch existing agents from registry:', err.message);
  }

  const agentName = process.env.AGENT_NAME || ('AgentPay-' + (await wallet.getAddress()).slice(0, 8));
  console.log(`📝 Registering new agent "${agentName}" on Somnia...`);
  try {
    const tx = await kit.contracts.registry.registerAgent(
      agentName,
      'Policy-enforced agentic payment layer for Somnia users',
      'ipfs://agentpay-v1',
      ['payments', 'policy', 'guard', 'defi']
    );
    const receipt = await tx.wait();
    const event = receipt.logs.find(
      (log) => log.topics[0] === kit.contracts.registry.interface.getEvent('AgentRegistered').topicHash
    );
    if (event) {
      const parsed = kit.contracts.registry.interface.parseLog(event);
      agentId = parsed?.args.agentId;
      console.log(`✨ New Agent Registered! ID: ${agentId}`);
    }
    return agentId;
  } catch (err) {
    console.error('❌ Failed to register agent:', err.message);
    return null;
  }
}

async function pay(to, amount, reason, token = 'STT', userAddress) {
  const decision = await engine.check(to, amount, reason, userAddress);

  if (!decision.allowed) {
    appendFailure({ to, amount, reason, blockedReason: decision.reason });
    return { success: false, reason: decision.reason, code: decision.code };
  }

  try {
    const finalUserAddr = userAddress || process.env.USER_ADDRESS || (await wallet.getAddress()); 
    const receipt = await executePayment(wallet, finalUserAddr, token, to, amount, reason, 'req_' + Date.now());

    appendSpend({ to, amount, reason, txHash: receipt.hash, token });
    return { success: true, txHash: receipt.hash };
  } catch (err) {
    appendFailure({ to, amount, reason, blockedReason: err.message });
    return { success: false, reason: err.message };
  }
}

async function setupEscrowPolicy(userAddress) {
  try {
    const finalUserAddr = userAddress || process.env.USER_ADDRESS || (await wallet.getAddress());
    await setPolicy(
      wallet,
      engine.localPolicy.perTxCapSTT,
      engine.localPolicy.dailyCapSTT,
      engine.localPolicy.circuitBreaker.maxTxPerHour,
      engine.localPolicy.allowedRecipients,
      finalUserAddr
    );
  } catch (err) {}
}

async function getSummary(userAddress) {
  const finalUserAddr = userAddress || process.env.USER_ADDRESS || (await wallet.getAddress());
  return engine ? await engine.summary(finalUserAddr) : null;
}

async function chat(message, vaultBalance, history = []) {
  return await parseIntent(message, vaultBalance, history);
}

async function chatOnChain(message, vaultBalance) {
  const intent = await parseIntentOnChain(message, wallet, vaultBalance);
  if (intent.requestId) {
    appendInference({
      message,
      response: intent.message,
      requestId: intent.requestId,
      verifiable: true
    });
  }
  return intent;
}

async function getUnifiedHistory(userAddress, limit = 50) {
  const finalUserAddr = userAddress || process.env.USER_ADDRESS || (await wallet.getAddress());
  const vault = await getVaultContract(wallet, finalUserAddr);
  
  const history = [];

  // 1. Fetch On-Chain Events
  try {
    const [execLogs, depLogs, withLogs] = await Promise.all([
      vault.queryFilter(vault.filters.Executed(finalUserAddr), -10000),
      vault.queryFilter(vault.filters.Deposited(finalUserAddr), -100000),
      vault.queryFilter(vault.filters.Withdrawn(finalUserAddr), -100000)
    ]);

    const blockTimestamps = new Map();
    const getBlockTime = async (num) => {
      if (blockTimestamps.has(num)) return blockTimestamps.get(num);
      const block = await provider.getBlock(num);
      const ts = (block?.timestamp || 0) * 1000;
      blockTimestamps.set(num, ts);
      return ts;
    };

    const seenRequestIds = new Set();

    for (const log of execLogs) {
      const requestId = log.args.requestId;
      if (requestId !== ethers.ZeroHash && seenRequestIds.has(requestId)) continue;
      if (requestId !== ethers.ZeroHash) seenRequestIds.add(requestId);

      history.push({
        id: log.transactionHash,
        type: 'payment',
        status: 'executed',
        label: log.args.reason || 'Payment',
        amount: ethers.formatEther(log.args.amount),
        token: Object.keys(TOKENS).find(key => TOKENS[key].toLowerCase() === (log.args.token || ethers.ZeroAddress).toLowerCase()) || 'STT',
        to: log.args.to,
        txHash: log.transactionHash,
        requestId: requestId === ethers.ZeroHash ? null : requestId,
        timestamp: await getBlockTime(log.blockNumber),
        verifiable: requestId !== ethers.ZeroHash
      });
    }

    for (const log of depLogs) {
      history.push({
        id: log.transactionHash,
        type: 'deposit',
        status: 'executed',
        label: 'Vault Deposit',
        amount: ethers.formatEther(log.args.amount),
        timestamp: await getBlockTime(log.blockNumber),
        txHash: log.transactionHash
      });
    }

    for (const log of withLogs) {
      history.push({
        id: log.transactionHash,
        type: 'withdrawal',
        status: 'executed',
        label: 'Vault Withdrawal',
        amount: ethers.formatEther(log.args.amount),
        timestamp: await getBlockTime(log.blockNumber),
        txHash: log.transactionHash
      });
    }
  } catch (err) {
    console.warn('⚠️  On-chain history fetch partially failed:', err.message);
  }

  // 2. Local Logs (Blocked, Swaps, Inferences)
  const localLogs = getHistory(200);
  localLogs.forEach(log => {
    if (log.txHash && history.some(h => h.txHash === log.txHash)) return;

    if (log.failed) {
      history.push({
        id: 'fail_' + log.timestamp,
        type: 'payment',
        status: 'blocked',
        label: 'Policy Violation',
        reason: log.reason,
        blockedReason: log.blockedReason,
        amount: log.amount?.toString(),
        timestamp: log.timestamp
      });
    } else if (log.type === 'swap') {
      history.push({
        id: log.txHash,
        type: 'swap',
        status: 'executed',
        label: `Swap ${log.fromToken} → ${log.toToken}`,
        amount: log.amount?.toString(),
        txHash: log.txHash,
        timestamp: log.timestamp
      });
    } else if (log.type === 'inference') {
      history.push({
        id: log.requestId,
        type: 'inference',
        status: 'executed',
        label: 'AI Verifiable Inference',
        reason: log.message,
        requestId: log.requestId,
        verifiable: true,
        timestamp: log.timestamp
      });
    }
  });

  // 3. Pending Schedules
  const schedules = getAllJobs();
  schedules.forEach(job => {
    history.push({
      id: 'sched_' + job.jobId,
      type: 'schedule',
      status: 'pending',
      label: 'Waiting for trigger',
      reason: job.reason,
      amount: job.amount?.toString(),
      condition: job.intervalLabel || (job.conditions ? JSON.stringify(job.conditions) : 'Pending'),
      timestamp: Date.now() + 1000
    });
  });

  return history
    .sort((a, b) => b.timestamp - a.timestamp)
    .slice(0, limit);
}

async function showBalances() {
  const address = await wallet.getAddress();
  const balance = await provider.getBalance(address);
  const ERC20_ABI = ['function balanceOf(address) external view returns (uint256)'];
  const tokenBalances = await Promise.all(
    Object.entries(TOKENS).map(async ([symbol, addr]) => {
      if (addr === ethers.ZeroAddress) return { symbol, bal: balance };
      try {
        const contract = new ethers.Contract(addr, ERC20_ABI, provider);
        return { symbol, bal: await contract.balanceOf(address) };
      } catch {
        return { symbol, bal: 0n };
      }
    })
  );
  console.log('\n💰 Balances:');
  tokenBalances.forEach(({ symbol, bal }) => {
    console.log(`   ${symbol}:  ${parseFloat(ethers.formatEther(bal)).toFixed(4)}`);
  });
}

module.exports = { init, registerAgent, pay, setupEscrowPolicy, prepareSwap, confirmSwap, getSummary, showBalances, chat, chatOnChain, getUnifiedHistory };

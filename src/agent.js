require('dotenv').config();
const { SomniaAgentKit, SOMNIA_NETWORKS } = require('somnia-agent-kit');
const { ethers } = require('ethers');
const PolicyEngine = require('./policyEngine');
const { appendSpend, appendFailure, appendSwap, getHistory } = require('../utils/store');
const { executePayment, setPolicy, TOKENS } = require('./escrow');
const { estimateSwap, executeSwap } = require('./dex');

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
  const userAddress = process.env.USER_ADDRESS || address;
  engine = new PolicyEngine(wallet, userAddress);
  await engine.syncOnChain();

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
      return agentId;
    }
  } catch (err) {}

  const agentName = process.env.AGENT_NAME || ('AgentPay-' + (await wallet.getAddress()).slice(0, 8));
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
    }
    return agentId;
  } catch (err) {
    return null;
  }
}

async function pay(to, amount, reason, token = 'STT') {
  const decision = await engine.check(to, amount, reason);

  if (!decision.allowed) {
    appendFailure({ to, amount, reason, blockedReason: decision.reason });
    return { success: false, reason: decision.reason, code: decision.code };
  }

  try {
    // In this multi-user version, we might need the user address from the request
    // For now we use a default if not provided, but server.js should pass it.
    // Assuming 'wallet' is the agent wallet that has permission to execute on vault.
    const userAddress = process.env.USER_ADDRESS || (await wallet.getAddress()); 
    const receipt = await executePayment(wallet, userAddress, token, to, amount, reason, 'req_' + Date.now());

    appendSpend({ to, amount, reason, txHash: receipt.hash, token });
    return { success: true, txHash: receipt.hash };
  } catch (err) {
    appendFailure({ to, amount, reason, blockedReason: err.message });
    return { success: false, reason: err.message };
  }
}

async function setupEscrowPolicy() {
  try {
    await setPolicy(
      wallet,
      engine.localPolicy.perTxCapSTT,
      engine.localPolicy.dailyCapSTT,
      engine.localPolicy.circuitBreaker.maxTxPerHour,
      engine.localPolicy.allowedRecipients
    );
  } catch (err) {}
}

async function getSummary() {
  return engine ? await engine.summary() : null;
}

module.exports = { init, registerAgent, pay, setupEscrowPolicy, prepareSwap, confirmSwap, getSummary };

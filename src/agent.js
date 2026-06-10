require('dotenv').config();
const { SomniaAgentKit, SOMNIA_NETWORKS } = require('somnia-agent-kit');
const { ethers } = require('ethers');
const PolicyEngine = require('./policyEngine');
const { appendSpend, appendFailure, appendSwap, appendInference, getHistory } = require('../utils/store');
const { executePayment, setPolicy, TOKENS, getVaultContract } = require('./escrow');
const { estimateSwap, executeSwap } = require('./dex');
const { parseIntentOnChain } = require('./brain');
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
    network: { rpcUrl: process.env.SOMNIA_RPC_URL, chainId: 50312, name: "testnet", explorer: "https://shannon-explorer.somnia.network" },
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

  // Show vault balance
  try {
    const vaultAbi = ['function getBalance(address user, address token) external view returns (uint256)'];
    const vaultContract = new ethers.Contract(process.env.VAULT_ADDRESS, vaultAbi, provider);
    const vaultBal = await vaultContract.getBalance(address, ethers.ZeroAddress);
    console.log('🏦 Vault:    ' + parseFloat(ethers.formatEther(vaultBal)).toFixed(4) + ' STT');
  } catch(e) {}
  console.log('💰 Balances:');
  tokenBalances.forEach(({ symbol, bal }) => {
    console.log(`   ${symbol}:  ${parseFloat(ethers.formatEther(bal)).toFixed(4)}`);
  });

  return { kit, engine, wallet, address, provider };
}

async function prepareSwap(fromToken, toToken, amount) {
  return await estimateSwap(wallet, fromToken, toToken, amount);
}

async function confirmSwap(fromToken, toToken, amount) {
  const result = await executeSwap(wallet, fromToken, toToken, amount);
  if (result.success) {
    appendSwap({ userAddress: wallet.address, fromToken, toToken, amount, txHash: result.txHash });
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
  const finalUserAddr = userAddress || process.env.USER_ADDRESS || wallet.address;

  if (!decision.allowed) {
    appendFailure({ userAddress: finalUserAddr, to, amount, reason, blockedReason: decision.reason });
    return { success: false, reason: decision.reason, code: decision.code };
  }

  try {
    const receipt = await executePayment(wallet, finalUserAddr, token, to, amount, reason, 'req_' + Date.now());

    appendSpend({ userAddress: finalUserAddr, to, amount, reason, txHash: receipt.hash, token });
    return { success: true, txHash: receipt.hash };
  } catch (err) {
    appendFailure({ userAddress: finalUserAddr, to, amount, reason, blockedReason: err.message });
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

async function chatOnChain(message, vaultBalance, userAddress) {
  const intent = await parseIntentOnChain(message, wallet, vaultBalance);
  if (intent.requestId) {
    appendInference({
      userAddress: userAddress || wallet.address,
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
  const vaultArtifact = require('../artifacts/AgentVault.json');
  
  const { findVault } = require('./escrow');
  const vaultAddr = await findVault(finalUserAddr);
  
  const history = [];

  const getTokenSymbol = (symOrAddr) => {
    if (!symOrAddr) return 'STT';
    if (typeof symOrAddr === 'string' && symOrAddr.length < 10) return symOrAddr.toUpperCase();
    return Object.keys(TOKENS).find(key => TOKENS[key].toLowerCase() === (symOrAddr || ethers.ZeroAddress).toLowerCase()) || 'STT';
  };

  if (vaultAddr) {
    const vault = new ethers.Contract(vaultAddr, vaultArtifact.abi, wallet);
    
    // 1. Fetch On-Chain Events
    try {
      const latestBlock = await provider.getBlockNumber();
      const fromBlock = Math.max(0, latestBlock - 999); // Somnia max block range
      const onChainTimeout = new Promise((_, reject) => setTimeout(() => reject(new Error('On-chain history timeout')), 8000));
      const [execLogs, depLogs, withLogs] = await Promise.race([
        Promise.all([
          vault.queryFilter(vault.filters.Executed(finalUserAddr), fromBlock),
          vault.queryFilter(vault.filters.Deposited(finalUserAddr), fromBlock),
          vault.queryFilter(vault.filters.Withdrawn(finalUserAddr), fromBlock)
        ]),
        onChainTimeout
      ]);

      const blockTimestamps = new Map();
      const getBlockTime = async (num) => {
        if (blockTimestamps.has(num)) return blockTimestamps.get(num);
        const block = await provider.getBlock(num);
        const ts = block ? (block.timestamp * 1000) : Date.now();
        blockTimestamps.set(num, ts);
        return ts;
      };

      const uniqueBlocks = [...new Set([...execLogs, ...depLogs, ...withLogs].map(l => l.blockNumber))];
      await Promise.all(uniqueBlocks.map(num => getBlockTime(num)));

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
          token: getTokenSymbol(log.args.token),
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
          token: getTokenSymbol(log.args.token),
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
          token: getTokenSymbol(log.args.token),
          timestamp: await getBlockTime(log.blockNumber),
          txHash: log.transactionHash
        });
      }
    } catch (err) {
      console.warn('⚠️  On-chain history fetch partially failed:', err.message);
    }
  }

  // 2. Local Logs (Blocked, Swaps, Inferences)
  const localLogs = getHistory(finalUserAddr, 200);
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
        token: log.token || 'STT',
        timestamp: log.timestamp
      });
    } else if (log.type === 'swap') {
      const fromSym = getTokenSymbol(log.fromToken);
      const toSym = getTokenSymbol(log.toToken);
      history.push({
        id: log.txHash,
        type: 'swap',
        status: 'executed',
        label: `Swap ${fromSym} → ${toSym}`,
        amount: log.amount?.toString(),
        token: fromSym,
        txHash: log.txHash,
        timestamp: log.timestamp
      });
    } else if (log.type === 'payment' && log.txHash) {
      history.push({
        id: log.txHash,
        type: 'payment',
        status: 'executed',
        label: 'Sent ' + (log.token || 'STT') + ' to ' + (log.to ? log.to.slice(0,10) + '...' : 'unknown'),
        to: log.to,
        amount: log.amount?.toString(),
        token: log.token || 'STT',
        reason: log.reason,
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
  schedules.filter(job => job.active).forEach(job => {
    history.push({
      id: 'sched_' + job.id,
      type: 'schedule',
      status: 'pending',
      label: 'Scheduled: ' + (job.reason || 'payment') + ' → ' + (job.to ? job.to.slice(0,10) + '...' : 'unknown'),
      amount: job.amount?.toString(),
      token: 'STT',
      condition: 'every ' + job.intervalLabel,
      timestamp: job.nextRun || Date.now() + 1000
    });
  });

  return history
    .sort((a, b) => { if (b.timestamp !== a.timestamp) return b.timestamp - a.timestamp; return (b.id || "").localeCompare(a.id || ""); })
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
  try {
    const vaultAbi = ['function getBalance(address user, address token) external view returns (uint256)'];
    const vaultContract = new ethers.Contract(process.env.VAULT_ADDRESS, vaultAbi, provider);
    const vaultBal = await vaultContract.getBalance(address, ethers.ZeroAddress);
    console.log('🏦 Vault:    ' + parseFloat(ethers.formatEther(vaultBal)).toFixed(4) + ' STT');
  } catch(e) {}
  console.log('\n💰 Balances:');
  tokenBalances.forEach(({ symbol, bal }) => {
    console.log(`   ${symbol}:  ${parseFloat(ethers.formatEther(bal)).toFixed(4)}`);
  });
}

async function executeIntent(intentName, amount, to, reason, userAddress) {
  const finalUserAddr = userAddress || process.env.USER_ADDRESS || (await wallet.getAddress());
  const vaultContract = await getVaultContract(wallet, finalUserAddr);
  const amountWei = ethers.parseEther(amount.toString());

  const targets = [];
  const datas = [];
  const values = [];

  if (intentName === 'safe_swap_pay') {
    // 1. Swap STT -> SUSD (V3)
    const routerAddr = require('./dex').SOMNIA_ROUTER;
    const routerIface = new ethers.Interface([
      "function exactInputSingle((address tokenIn, address tokenOut, uint24 fee, address recipient, uint256 amountIn, uint256 amountOutMinimum, uint160 sqrtPriceLimitX96) params) external payable returns (uint256 amountOut)"
    ]);
    const erc20Iface = new ethers.Interface([
      "function transfer(address,uint256) external returns (bool)"
    ]);
    
    const TOKENS = require('./dex').TOKENS;
    
    datas.push(routerIface.encodeFunctionData("exactInputSingle", [{
      tokenIn: TOKENS.WSTT, 
      tokenOut: TOKENS.SUSD, 
      fee: 500, 
      recipient: await vaultContract.getAddress(),
      amountIn: amountWei, 
      amountOutMinimum: 0, 
      sqrtPriceLimitX96: 0
    }]));
    targets.push(routerAddr);
    values.push(amountWei);

    // 2. Transfer SUSD to recipient
    datas.push(erc20Iface.encodeFunctionData("transfer", [to, amountWei])); 
    targets.push(TOKENS.SUSD);
    values.push(0);

    try {
      const tx = await vaultContract.multicall(
        finalUserAddr, targets, datas, values, ethers.ZeroAddress, amountWei, 
        reason || "Atomic Swap+Pay", ethers.id(Date.now().toString()),
        { gasLimit: 2000000 }
      );
      const receipt = await tx.wait();
      return { success: true, status: 'executed', txHash: receipt.hash, explorer: 'https://shannon-explorer.somnia.network/tx/' + receipt.hash };
    } catch (err) {
      return { success: false, error: err.message };
    }
  }

  if (intentName === 'provide_liquidity') {
    const halfAmount = amountWei / 2n;
    const v2RouterAddr = "0xc81501B65A040bF5f1794D0Ca2b953aebb2b1996";
    const routerIface = new ethers.Interface([
      "function swapExactTokensForTokens(uint256,uint256,address[],address,uint256) external returns (uint256[])",
      "function addLiquidity(address,address,uint256,uint256,uint256,uint256,address,uint256) external returns (uint256,uint256,uint256)"
    ]);
    
    const TOKENS = require('./dex').TOKENS;
    
    // 1. Swap HALF of STT to SUSD (V2)
    datas.push(routerIface.encodeFunctionData("swapExactTokensForTokens", [
      halfAmount, 0, [TOKENS.WSTT, TOKENS.SUSD], await vaultContract.getAddress(), Math.floor(Date.now() / 1000) + 600
    ]));
    targets.push(v2RouterAddr);
    values.push(halfAmount);

    // 2. Add Liquidity STT + SUSD
    datas.push(routerIface.encodeFunctionData("addLiquidity", [
      TOKENS.WSTT, TOKENS.SUSD, halfAmount, halfAmount, 0, 0, await vaultContract.getAddress(), Math.floor(Date.now() / 1000) + 600
    ]));
    targets.push(v2RouterAddr);
    values.push(halfAmount);

    try {
      const tx = await vaultContract.multicall(
        finalUserAddr, targets, datas, values, ethers.ZeroAddress, amountWei, 
        "Provide Liquidity (Atomic)", ethers.id(Date.now().toString()),
        { gasLimit: 3000000 }
      );
      const receipt = await tx.wait();
      return { success: true, status: 'executed', txHash: receipt.hash, explorer: 'https://shannon-explorer.somnia.network/tx/' + receipt.hash };
    } catch (err) {
      return { success: false, error: err.message };
    }
  }

  return { success: false, error: 'Unsupported intent: ' + intentName };
}


async function getVaultBalance() {
  const vaultAbi = ['function getBalance(address user, address token) external view returns (uint256)'];
  const vaultContract = new ethers.Contract(process.env.VAULT_ADDRESS, vaultAbi, provider);
  const bal = await vaultContract.getBalance(wallet.address, ethers.ZeroAddress);
  return parseFloat(ethers.formatEther(bal)).toFixed(4);
}

module.exports = { init, registerAgent, pay, setupEscrowPolicy, prepareSwap, confirmSwap, getSummary, showBalances, chatOnChain, getUnifiedHistory, executeIntent, getVaultBalance };

// Quote a stable -> ETH swap on a chain that has Uniswap QuoterV2.
// Execution sends stable through AgentVault first, then SwapExecutor.
// If the executor or the vault for that chain is missing, nothing moves.

const fs = require('fs');
const path = require('path');
const { ethers } = require('ethers');
const { getChain, getProvider, txUrl, activeId } = require('./chain');

const FEES = [500, 3000, 100, 10000];
const SLIPPAGE_BPS = 50;

const QUOTER_ABI = [
  'function quoteExactInputSingle((address tokenIn, address tokenOut, uint256 amountIn, uint24 fee, uint160 sqrtPriceLimitX96) params) external returns (uint256 amountOut, uint160 sqrtPriceX96After, uint32 initializedTicksCrossed, uint256 gasEstimate)',
];

const VAULT_EXECUTE_ABI = [
  'function execute(address user, address to, uint256 amount, string reason, bytes32 requestId) external',
];

const EXECUTOR_ABI = [
  'function swapExactInputSingle(address tokenOut, uint24 fee, address recipient, uint256 amountIn, uint256 amountOutMinimum) external returns (uint256 amountOut)',
  'function refund(address to, uint256 amount) external',
];

function outputToken(chain, symbol) {
  const name = String(symbol || 'ETH').toUpperCase();
  if (name === 'ETH' || name === 'WETH') {
    if (!chain.weth) {
      throw new Error(`${chain.name} has no WETH address, so a swap to ETH is not wired`);
    }
    return { symbol: 'ETH', address: chain.weth, decimals: 18 };
  }
  throw new Error(`Swap output "${symbol}" is not supported. Ask for ETH.`);
}

function inputToken(chain, symbol) {
  const name = String(symbol || chain.stable.symbol).toUpperCase();
  if (name !== chain.stable.symbol) {
    throw new Error(`${chain.name} vault holds ${chain.stable.symbol}, not ${name}`);
  }
  return chain.stable;
}

function deploymentPath(chain) {
  return path.join(__dirname, '../artifacts', `AgentVault-${chain.chainId}.json`);
}

function remembered(chain) {
  try {
    return require('./chainRegistry').recall(chain.id);
  } catch (_) {
    return null;
  }
}

function vaultAddressFor(chain) {
  const envKey = `VAULT_ADDRESS_${chain.id.toUpperCase()}`;
  if (process.env[envKey]) return process.env[envKey];
  if (chain.id === activeId() && process.env.VAULT_ADDRESS) return process.env.VAULT_ADDRESS;
  const saved = remembered(chain);
  if (saved && saved.vault) return saved.vault;
  const file = deploymentPath(chain);
  if (fs.existsSync(file)) {
    const parsed = JSON.parse(fs.readFileSync(file, 'utf8'));
    if (parsed.address) return parsed.address;
  }
  if (chain.id === 'arc') {
    const legacy = path.join(__dirname, '../artifacts/AgentVault-deployment.json');
    if (fs.existsSync(legacy)) {
      return JSON.parse(fs.readFileSync(legacy, 'utf8')).address;
    }
  }
  return null;
}

function executorAddressFor(chain) {
  const envKey = `SWAP_EXECUTOR_${chain.id.toUpperCase()}`;
  if (process.env[envKey]) return process.env[envKey];
  if (chain.id === activeId() && process.env.SWAP_EXECUTOR) return process.env.SWAP_EXECUTOR;
  const saved = remembered(chain);
  if (saved && saved.executor) return saved.executor;
  const file = path.join(__dirname, '../artifacts', `SwapExecutor-${chain.chainId}.json`);
  if (fs.existsSync(file)) {
    const parsed = JSON.parse(fs.readFileSync(file, 'utf8'));
    if (parsed.address) return parsed.address;
  }
  return null;
}

async function quoteOne(quoter, tokenIn, tokenOut, amountIn, fee) {
  const result = await quoter.quoteExactInputSingle.staticCall({
    tokenIn,
    tokenOut,
    amountIn,
    fee,
    sqrtPriceLimitX96: 0,
  });
  return result.amountOut ?? result[0];
}

async function quoteSwap({ chain: chainName, fromAsset, toAsset, amount }) {
  const chain = getChain(chainName);
  const stable = inputToken(chain, fromAsset);
  const out = outputToken(chain, toAsset);
  const human = Number(amount);
  if (!(human > 0)) throw new Error('Swap amount must be greater than 0');

  if (!chain.quoter || !chain.swapRouter) {
    throw new Error(`${chain.name} has no Uniswap quoter. Swap quoting is live on Base, Ethereum, and Robinhood Chain.`);
  }

  const provider = getProvider(chain.id);
  const quoter = new ethers.Contract(chain.quoter, QUOTER_ABI, provider);
  const amountIn = ethers.parseUnits(String(human), stable.decimals);

  let best = null;
  let lastError = null;
  for (const fee of FEES) {
    try {
      const amountOut = await quoteOne(quoter, stable.address, out.address, amountIn, fee);
      if (amountOut > 0n && (!best || amountOut > best.amountOut)) {
        best = { fee, amountOut };
      }
    } catch (err) {
      lastError = err;
    }
  }
  if (!best) {
    throw new Error(`No ${stable.symbol}/${out.symbol} pool on ${chain.name}. ${lastError ? lastError.shortMessage || lastError.message : ''}`.trim());
  }

  const slippage = (best.amountOut * BigInt(SLIPPAGE_BPS)) / 10000n;
  const amountOutMin = best.amountOut - slippage;
  return {
    chain: chain.id,
    chainId: chain.chainId,
    chainName: chain.name,
    from: stable.symbol,
    to: out.symbol,
    amountIn: human,
    amountOut: Number(ethers.formatUnits(best.amountOut, out.decimals)),
    amountOutMin: Number(ethers.formatUnits(amountOutMin, out.decimals)),
    amountOutRaw: best.amountOut.toString(),
    amountOutMinRaw: amountOutMin.toString(),
    fee: best.fee,
    slippageBps: SLIPPAGE_BPS,
    tokenIn: stable.address,
    tokenOut: out.address,
    quoter: chain.quoter,
    router: chain.swapRouter,
  };
}

async function executeSwap({ chain: chainName, fromAsset, toAsset, amount, userAddress, recipient }) {
  const chain = getChain(chainName);
  if (!chain.testnet && process.env.ALLOW_MAINNET !== '1') {
    return {
      success: false,
      executed: false,
      reason: chain.name + ' is mainnet. Settlement stays on testnet until you explicitly allow mainnet. Funds were not moved.',
    };
  }
  const quote = await quoteSwap({ chain: chainName, fromAsset, toAsset, amount });
  const vault = vaultAddressFor(chain);
  const executor = executorAddressFor(chain);

  if (!vault || !executor) {
    return {
      success: false,
      executed: false,
      quote,
      reason: !vault
        ? `No AgentVault on ${chain.name} yet. Run CHAIN=${chain.id} node scripts/deploy.js. Funds were not moved.`
        : `No SwapExecutor on ${chain.name} yet. Run CHAIN=${chain.id} node scripts/deploySwapExecutor.js. Funds were not moved.`,
    };
  }
  if (!process.env.PRIVATE_KEY) {
    return {
      success: false,
      executed: false,
      quote,
      reason: 'PRIVATE_KEY is not set, so this swap cannot be signed. Funds were not moved.',
    };
  }
  if (!userAddress) {
    return { success: false, executed: false, quote, reason: 'Missing user address. Funds were not moved.' };
  }

  const provider = getProvider(chain.id);
  const signer = new ethers.Wallet(process.env.PRIVATE_KEY, provider);
  const requestId = ethers.id(`swap:${chain.id}:${userAddress}:${quote.from}:${quote.amountIn}:${Date.now()}`);

  try {
    const decisionLog = require('./decisionLog');
    await decisionLog.commitDecision(signer, requestId, { quote, userAddress }, `swap ${quote.amountIn} ${quote.from} to ${quote.to} on ${chain.name}`);
  } catch (err) {
    console.error('[swap] decision commit skipped:', err.message);
  }

  const amountIn = ethers.parseUnits(String(quote.amountIn), chain.stable.decimals);
  const vaultContract = new ethers.Contract(vault, VAULT_EXECUTE_ABI, signer);
  let fundTx;
  try {
    fundTx = await vaultContract.execute(
      userAddress,
      executor,
      amountIn,
      `swap ${quote.amountIn} ${quote.from} to ${quote.to}`,
      requestId
    );
    await fundTx.wait();
  } catch (err) {
    return {
      success: false,
      executed: false,
      quote,
      reason: `Vault refused the swap: ${err.shortMessage || err.message}. Funds were not moved.`,
    };
  }

  const exec = new ethers.Contract(executor, EXECUTOR_ABI, signer);
  try {
    const swapTx = await exec.swapExactInputSingle(
      quote.tokenOut,
      quote.fee,
      recipient || userAddress,
      amountIn,
      BigInt(quote.amountOutMinRaw)
    );
    const receipt = await swapTx.wait();
    return {
      success: true,
      executed: true,
      quote,
      txHash: receipt.hash,
      fundTxHash: fundTx.hash,
      explorer: txUrl(chain, receipt.hash),
      amountOut: quote.amountOut,
    };
  } catch (err) {
    try {
      const refundTx = await exec.refund(userAddress, amountIn);
      await refundTx.wait();
      return {
        success: false,
        executed: false,
        refunded: true,
        quote,
        fundTxHash: fundTx.hash,
        reason: `Swap failed and the stable was refunded to ${userAddress}. ${err.shortMessage || err.message}`,
      };
    } catch (refundErr) {
      return {
        success: false,
        executed: false,
        refunded: false,
        quote,
        fundTxHash: fundTx.hash,
        reason: `Swap failed and the refund also failed. Stable may be on the executor. ${refundErr.shortMessage || refundErr.message}`,
      };
    }
  }
}

module.exports = {
  quoteSwap,
  executeSwap,
  vaultAddressFor,
  executorAddressFor,
  outputToken,
  inputToken,
};

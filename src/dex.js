const { ethers, getAddress } = require('ethers');

// Uniswap V3 Router ABI
const ROUTER_ABI = [
  "function exactInputSingle((address tokenIn, address tokenOut, uint24 fee, address recipient, uint256 amountIn, uint256 amountOutMinimum, uint160 sqrtPriceLimitX96) params) external payable returns (uint256 amountOut)",
  "function exactInput((bytes path, address recipient, uint256 amountIn, uint256 amountOutMinimum) params) external payable returns (uint256 amountOut)"
];

const QUOTER_ABI = [
  "function quoteExactInputSingle(address tokenIn, address tokenOut, uint24 fee, uint256 amountIn, uint160 sqrtPriceLimitX96) external returns (uint256 amountOut)"
];

const ERC20_ABI = [
  "function approve(address spender, uint256 amount) external returns (bool)",
  "function allowance(address owner, address spender) external view returns (uint256)",
  "function balanceOf(address account) external view returns (uint256)",
  "function decimals() external view returns (uint8)"
];

// Somnia Shannon Testnet Config
const SOMNIA_ROUTER = getAddress("0x6AAC14f090A35EeA150705f72D90E4CDC4a49b2C");
const SOMNIA_V2_ROUTER = "0xc81501B65A040bF5f1794D0Ca2b953aebb2b1996";
const V2_ROUTER_ABI = [
  "function swapExactTokensForTokens(uint256 amountIn, uint256 amountOutMin, address[] calldata path, address to, uint256 deadline) external returns (uint256[] memory amounts)",
  "function addLiquidity(address tokenA, address tokenB, uint256 amountADesired, uint256 amountBDesired, uint256 amountAMin, uint256 amountBMin, address to, uint256 deadline) external returns (uint256 amountA, uint256 amountB, uint256 liquidity)"
];
const FEE_TIER = 500; // 0.05%

const TOKENS = {
  WSTT: getAddress("0x4A3BC48C156384f9564Fd65A53a2f3D534D8f2b7"),
  PING: getAddress("0x33E7fAB0a8a5da1A923180989bD617c9c2D1C493"),
  PONG: getAddress("0x9beaA0016c22B646Ac311Ab171270B0ECf23098F"),
  SUSD: getAddress("0x65296738D4E5edB1515e40287B6FDf8320E6eE04"),
};

function resolveToken(symbol) {
  if (symbol === 'STT') return TOKENS.WSTT;
  const addr = TOKENS[symbol.toUpperCase()];
  if (addr) return addr;
  // assume raw address
  return getAddress(symbol);
}

async function estimateSwap(wallet, tokenIn, tokenOut, amount) {
  try {
    const addrIn = resolveToken(tokenIn);
    const addrOut = resolveToken(tokenOut);
    const amountInWei = ethers.parseEther(amount.toString());

    const gasLimit = 300000n;
    const feeData = await wallet.provider.getFeeData();
    const gasPrice = feeData.gasPrice || ethers.parseUnits('1', 'gwei');
    const estGasCost = ethers.formatEther(gasLimit * gasPrice);

    return {
      success: true,
      expectedOut: 'estimated on execution',
      estGasCost,
      addrIn,
      addrOut,
      amountInWei: amountInWei.toString()
    };
  } catch (err) {
    return { success: false, error: err.message + ' | ' + (err.data || '') + ' | ' + (err.reason || '') };
  }
}

async function executeSwap(wallet, tokenIn, tokenOut, amount) {
  try {
    const addrIn = resolveToken(tokenIn);
    const addrOut = resolveToken(tokenOut);
    const amountInWei = ethers.parseEther(amount.toString());
    const deadline = Math.floor(Date.now() / 1000) + 60 * 10;
    const router = new ethers.Contract(SOMNIA_ROUTER, ROUTER_ABI, wallet);

    const isNativeIn = tokenIn === 'STT';

    // Approve if not native STT
    if (!isNativeIn) {
      const tokenContract = new ethers.Contract(addrIn, ERC20_ABI, wallet);
      const allowance = await tokenContract.allowance(wallet.address, SOMNIA_ROUTER);
      if (allowance < amountInWei) {
        console.log('🔓 Approving token...');
        const appTx = await tokenContract.approve(SOMNIA_ROUTER, ethers.MaxUint256);
        await appTx.wait();
        console.log('✅ Approved');
      }
    }

    // Use V2 router for WSTT/SUSD pair
    const isV2Pair = (
      (addrIn === TOKENS.WSTT && addrOut === TOKENS.SUSD) ||
      (addrIn === TOKENS.SUSD && addrOut === TOKENS.WSTT)
    );

    if (isV2Pair) {
      if (!isNativeIn) {
        const tokenContract = new ethers.Contract(addrIn, ERC20_ABI, wallet);
        const allowance = await tokenContract.allowance(wallet.address, SOMNIA_V2_ROUTER);
        if (allowance < amountInWei) {
          console.log('🔓 Approving token for V2 router...');
          const appTx = await tokenContract.approve(SOMNIA_V2_ROUTER, ethers.MaxUint256);
          await appTx.wait();
        }
      }
      const v2router = new ethers.Contract(SOMNIA_V2_ROUTER, V2_ROUTER_ABI, wallet);
      const tx = await v2router.swapExactTokensForTokens(
        amountInWei, 0, [addrIn, addrOut], wallet.address, deadline,
        { gasLimit: 2000000 }
      );
      const receipt = await tx.wait();
      return { success: true, txHash: receipt.hash };
    }

    const params = {
      tokenIn: addrIn,
      tokenOut: addrOut,
      fee: FEE_TIER,
      recipient: wallet.address,
      amountIn: amountInWei,
      amountOutMinimum: 0n,
      sqrtPriceLimitX96: 0n
    };

    const tx = await router.exactInputSingle(params, {
      gasLimit: 1400000,
      value: isNativeIn ? amountInWei : 0n
    });

    const receipt = await tx.wait();
    return { success: true, txHash: receipt.hash };
  } catch (err) {
    return { success: false, error: err.message };
  }
}

module.exports = { estimateSwap, executeSwap, SOMNIA_ROUTER, TOKENS, resolveToken };

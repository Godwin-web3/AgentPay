/**
 * Provider stubs
 *
 * Replace these with real HTTP calls to an aggregator or bridge API.
 * They must remain side-effect free. No private keys. No vault calls.
 */

async function quoteSwap(intent) {
  // TODO: call 0x, 1inch, or Uniswap quoter
  return {
    fromAsset: intent.asset,
    toAsset: intent.toAsset || 'ETH',
    amountIn: intent.amount,
    amountOutEstimated: null,
    slippageBps: intent.slippageBps || 50,
    route: 'placeholder',
    provider: 'stub',
  };
}

async function quoteBridge(intent) {
  // TODO: call CCTP, Across, or other bridge quote endpoint
  return {
    asset: intent.asset,
    amount: intent.amount,
    sourceNetwork: intent.sourceNetwork,
    destNetwork: intent.destNetwork,
    fee: null,
    provider: 'stub',
  };
}

module.exports = { quoteSwap, quoteBridge };

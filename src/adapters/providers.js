/**
 * Provider stubs
 *
 * Set QUOTE_SWAP_URL or QUOTE_BRIDGE_URL to point at a real endpoint.
 * The functions remain side-effect free. No private keys. No vault calls.
 */

async function quoteSwap(intent) {
  const url = process.env.QUOTE_SWAP_URL;
  if (url) {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(intent),
    });
    if (!res.ok) throw new Error(`quoteSwap failed: ${res.status}`);
    return res.json();
  }
  // fallback stub
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
  const url = process.env.QUOTE_BRIDGE_URL;
  if (url) {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(intent),
    });
    if (!res.ok) throw new Error(`quoteBridge failed: ${res.status}`);
    return res.json();
  }
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

const { ExecutionAdapter } = require('./ExecutionAdapter');

/**
 * SwapAdapter
 *
 * Proposes a swap (e.g. USDC -> ETH) via an external aggregator or DEX.
 * propose() and estimate() are side-effect free.
 * execute() expects the caller to have already authorized any required
 * USDC movement through AgentVault. The adapter itself does not hold keys
 * or call the vault.
 *
 * This is a proposal stub. Real DEX routing would be injected via a
 * provider function that returns quotes without signing.
 */
class SwapAdapter extends ExecutionAdapter {
  constructor({ quoteProvider } = {}) {
    super({
      name: 'swap',
      supportedAssets: ['USDC', 'ETH', 'WETH'],
      supportedNetworks: ['arc'], // extend per network
    });
    this.quoteProvider = quoteProvider || this._defaultQuote;
  }

  async _defaultQuote(intent) {
    // Placeholder. Replace with real aggregator call that returns a quote object.
    return {
      fromAsset: intent.asset,
      toAsset: intent.toAsset || 'ETH',
      amountIn: intent.amount,
      amountOutEstimated: null,
      slippageBps: intent.slippageBps || 50,
      route: 'stub',
    };
  }

  async propose(intent) {
    if (!this.supports(intent)) {
      return { supported: false, reason: 'asset or network not supported' };
    }
    const quote = await this.quoteProvider(intent);
    return {
      supported: true,
      adapter: this.name,
      asset: intent.asset,
      toAsset: intent.toAsset,
      amount: intent.amount,
      quote,
      requiresVaultAuthorization: true,
      notes: 'Any source-asset transfer must go through AgentVault first',
    };
  }

  async estimate(intent) {
    const proposal = await this.propose(intent);
    return {
      ...proposal,
      latencyMs: 5000,
      successProbability: 0.95,
    };
  }

  async execute(authorizedIntent) {
    // No on-chain call here. Caller must have authorized via vault
    // and then submitted the swap tx separately if needed.
    return {
      adapter: this.name,
      requestId: authorizedIntent.requestId,
      status: 'proposed-after-vault',
      verified: false,
    };
  }
}

module.exports = { SwapAdapter };

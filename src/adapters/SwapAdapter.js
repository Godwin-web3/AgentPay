const { ExecutionAdapter } = require('./ExecutionAdapter');
const { quoteSwap } = require('./providers');

/**
 * SwapAdapter
 *
 * Proposes a swap (e.g. USDC -> ETH) via an external aggregator or DEX.
 * propose() and estimate() are side-effect free.
 * execute() expects the caller to have already authorized any required
 * USDC movement through AgentVault. The adapter itself does not hold keys
 * or call the vault.
 */
class SwapAdapter extends ExecutionAdapter {
  constructor({ quoteProvider } = {}) {
    super({
      name: 'swap',
      supportedAssets: ['USDC', 'USDG', 'ETH', 'WETH'],
      supportedNetworks: ['arc', 'base', 'ethereum', 'robinhood'],
    });
    this.quoteProvider = quoteProvider || quoteSwap;
  }

  supports(intent) {
    const asset = intent.asset || intent.fromAsset || 'USDC';
    const network = intent.network || intent.chain;
    const assetOk = this.supportedAssets.includes(asset) || this.supportedAssets.includes(intent.toAsset);
    if (!network) return assetOk || this.supportedAssets.includes('USDC');
    return assetOk && this.supportedNetworks.includes(network);
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
    const { executeSwap } = require('../swap');
    return executeSwap({
      chain: authorizedIntent.chain || authorizedIntent.network,
      fromAsset: authorizedIntent.asset || authorizedIntent.fromAsset,
      toAsset: authorizedIntent.toAsset,
      amount: authorizedIntent.amount,
      userAddress: authorizedIntent.userAddress,
      recipient: authorizedIntent.recipient,
    });
  }
}

module.exports = { SwapAdapter };

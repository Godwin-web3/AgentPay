const { ExecutionAdapter } = require('./ExecutionAdapter');

/**
 * CrossNetworkAdapter
 *
 * Proposes moving an asset from one EVM network to another.
 * Source-side authorization still happens in AgentVault (or equivalent
 * on the source network). Destination settlement is tracked separately.
 * This adapter does not bridge funds itself.
 */
class CrossNetworkAdapter extends ExecutionAdapter {
  constructor() {
    super({
      name: 'cross-network',
      supportedAssets: ['USDC'],
      supportedNetworks: ['arc', 'base'], // extend as needed
    });
  }

  async propose(intent) {
    if (!intent.sourceNetwork || !intent.destNetwork) {
      return { supported: false, reason: 'source and dest network required' };
    }
    return {
      supported: true,
      adapter: this.name,
      asset: intent.asset,
      amount: intent.amount,
      sourceNetwork: intent.sourceNetwork,
      destNetwork: intent.destNetwork,
      requiresVaultAuthorization: true,
      notes: 'Authorize source transfer via AgentVault; destination is a separate verification step',
    };
  }

  async estimate(intent) {
    const proposal = await this.propose(intent);
    return {
      ...proposal,
      latencyMs: 30000,
      successProbability: 0.9,
    };
  }

  async execute(authorizedIntent) {
    return {
      adapter: this.name,
      requestId: authorizedIntent.requestId,
      status: 'source-authorized',
      verified: false,
    };
  }
}

module.exports = { CrossNetworkAdapter };

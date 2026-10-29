const { ExecutionAdapter } = require('./ExecutionAdapter');

/**
 * DirectUSDCAdapter
 *
 * Proposes a same-network USDC transfer. Execution is a no-op here;
 * the caller must already have routed the payment through AgentVault.execute
 * or executeWithSig. This adapter only records the proposal and the
 * expected on-chain outcome so the settlement layer can verify later.
 */
class DirectUSDCAdapter extends ExecutionAdapter {
  constructor() {
    super({
      name: 'direct-usdc',
      supportedAssets: ['USDC'],
      supportedNetworks: ['arc'], // extend as other EVM networks are added
    });
  }

  async propose(intent) {
    if (intent.asset !== 'USDC') {
      return { supported: false, reason: 'asset not USDC' };
    }
    return {
      supported: true,
      adapter: this.name,
      asset: intent.asset,
      amount: intent.amount,
      to: intent.to,
      network: intent.network || 'arc',
      estimatedFee: '0', // native USDC gas on Arc; actual fee paid by operator
      requiresVaultAuthorization: true,
      notes: 'Must call AgentVault before considering this settled',
    };
  }

  async estimate(intent) {
    const proposal = await this.propose(intent);
    return {
      ...proposal,
      latencyMs: 2000,
      successProbability: 0.99,
    };
  }

  async execute(authorizedIntent) {
    // No funds move here. The vault already did the transfer.
    // Return a receipt shape the settlement layer can later match
    // against the AgentVault Executed event for the same requestId.
    return {
      adapter: this.name,
      requestId: authorizedIntent.requestId,
      status: 'vault-executed',
      asset: authorizedIntent.asset,
      amount: authorizedIntent.amount,
      to: authorizedIntent.to,
      verified: false, // settlement layer sets this after confirming the event
    };
  }
}

module.exports = { DirectUSDCAdapter };

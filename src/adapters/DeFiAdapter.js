const { ExecutionAdapter } = require('./ExecutionAdapter');

/**
 * DeFiAdapter
 *
 * Proposes a deposit, withdraw, or borrow against a supported protocol.
 * propose() returns risk notes and estimated terms. It does not deposit.
 * Any source-asset movement still requires prior AgentVault authorization.
 */
class DeFiAdapter extends ExecutionAdapter {
  constructor() {
    super({
      name: 'defi',
      supportedAssets: ['USDC', 'ETH'],
      supportedNetworks: ['arc'],
    });
  }

  async propose(intent) {
    if (!['deposit', 'withdraw', 'borrow'].includes(intent.action)) {
      return { supported: false, reason: 'action must be deposit|withdraw|borrow' };
    }
    return {
      supported: true,
      adapter: this.name,
      action: intent.action,
      asset: intent.asset,
      amount: intent.amount,
      protocol: intent.protocol || 'stub',
      risks: [
        'Smart contract risk',
        'Oracle risk',
        'Liquidation risk if borrowing',
      ],
      requiresVaultAuthorization: true,
      notes: 'Deposit of source asset must be authorized via AgentVault first',
    };
  }

  async estimate(intent) {
    const proposal = await this.propose(intent);
    return { ...proposal, latencyMs: 4000, successProbability: 0.92 };
  }

  async execute(authorizedIntent) {
    return {
      adapter: this.name,
      requestId: authorizedIntent.requestId,
      status: 'proposed-after-vault',
      verified: false,
    };
  }
}

module.exports = { DeFiAdapter };

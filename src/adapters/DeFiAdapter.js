const { ExecutionAdapter } = require('./ExecutionAdapter');

/**
 * DeFiAdapter
 *
 * Proposes a deposit, withdraw, or borrow against a supported protocol.
 * propose() returns risk notes and estimated terms. It does not deposit.
 * Any source-asset movement still requires prior AgentVault authorization.
 *
 * Set DEFI_QUOTE_URL to point at a real protocol quote endpoint.
 */
class DeFiAdapter extends ExecutionAdapter {
  constructor({ quoteProvider } = {}) {
    super({
      name: 'defi',
      supportedAssets: ['USDC', 'ETH'],
      supportedNetworks: ['arc'],
    });
    this.quoteProvider = quoteProvider || this._defaultQuote;
  }

  async _defaultQuote(intent) {
    const url = process.env.DEFI_QUOTE_URL;
    if (url) {
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(intent),
      });
      if (!res.ok) throw new Error(`DeFi quote failed: ${res.status}`);
      return res.json();
    }
    return {
      protocol: intent.protocol || 'stub',
      estimatedApy: null,
      risks: [
        'Smart contract risk',
        'Oracle risk',
        'Liquidation risk if borrowing',
      ],
    };
  }

  async propose(intent) {
    if (!['deposit', 'withdraw', 'borrow'].includes(intent.action)) {
      return { supported: false, reason: 'action must be deposit|withdraw|borrow' };
    }
    const quote = await this.quoteProvider(intent);
    return {
      supported: true,
      adapter: this.name,
      action: intent.action,
      asset: intent.asset,
      amount: intent.amount,
      ...quote,
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

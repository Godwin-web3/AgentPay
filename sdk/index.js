/**
 * AgentPay SDK
 *
 * Exposes propose() and payment request helpers.
 * Does not hold private keys or call AgentVault directly.
 * Callers must still authorize any fund movement through the vault
 * or a signed executeWithSig path.
 */

const { getAdaptersFor } = require('../src/adapters');
const { PaymentRequest } = require('../src/payments');

class AgentPayClient {
  constructor({ baseUrl } = {}) {
    this.baseUrl = baseUrl || '';
  }

  async propose(intent) {
    const adapters = getAdaptersFor(intent);
    const proposals = [];
    for (const a of adapters) {
      proposals.push(await a.propose(intent));
    }
    return proposals;
  }

  createPaymentRequest(params) {
    return new PaymentRequest(params).toJSON();
  }
}

module.exports = { AgentPayClient };

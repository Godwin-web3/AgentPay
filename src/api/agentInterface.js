const { getAdaptersFor } = require('../adapters');
const { PaymentRequest } = require('../payments');

/**
 * External agent interface
 *
 * Accepts a structured intent from an outside agent or framework.
 * Returns a proposal or a PaymentRequest. Does not move funds.
 * Any settlement still requires the payer to authorize via AgentVault
 * (execute or executeWithSig) or an equivalent on-chain policy check.
 */

async function handleAgentIntent(intent) {
  if (!intent || !intent.action) {
    throw new Error('intent.action required');
  }

  if (intent.action === 'propose') {
    const adapters = getAdaptersFor(intent);
    const proposals = [];
    for (const a of adapters) {
      proposals.push(await a.propose(intent));
    }
    return { type: 'proposals', proposals };
  }

  if (intent.action === 'request_payment') {
    const req = new PaymentRequest({
      from: intent.from,
      to: intent.to,
      amount: intent.amount,
      asset: intent.asset || 'USDC',
      network: intent.network || 'arc',
      description: intent.description || '',
    });
    return { type: 'payment_request', request: req.toJSON() };
  }

  throw new Error('unsupported action: ' + intent.action);
}

module.exports = { handleAgentIntent };

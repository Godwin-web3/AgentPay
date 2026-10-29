const { describe, it } = require('node:test');
const assert = require('node:assert');
const { DirectUSDCAdapter, SwapAdapter, DeFiAdapter } = require('../src/adapters');
const { PaymentRequest } = require('../src/payments');

describe('adapters', () => {
  it('DirectUSDCAdapter proposes without moving funds', async () => {
    const a = new DirectUSDCAdapter();
    const p = await a.propose({ asset: 'USDC', amount: '100', to: '0xabc', network: 'arc' });
    assert.equal(p.supported, true);
    assert.equal(p.requiresVaultAuthorization, true);
  });

  it('SwapAdapter proposes without executing', async () => {
    const a = new SwapAdapter();
    const p = await a.propose({ asset: 'USDC', toAsset: 'ETH', amount: '50' });
    assert.equal(p.supported, true);
    assert.equal(p.requiresVaultAuthorization, true);
  });

  it('DeFiAdapter returns risks', async () => {
    const a = new DeFiAdapter();
    const p = await a.propose({ action: 'deposit', asset: 'USDC', amount: '10' });
    assert.ok(p.risks && p.risks.length > 0);
  });
});

describe('PaymentRequest', () => {
  it('lifecycle does not imply settlement', () => {
    const r = new PaymentRequest({ to: '0x1', amount: '5' });
    assert.equal(r.state, 'created');
    r.share();
    assert.equal(r.state, 'shared');
    r.review();
    assert.equal(r.state, 'reviewed');
    // authorize and settle still require external vault call
    r.authorize('req-1');
    assert.equal(r.state, 'authorized');
  });
});

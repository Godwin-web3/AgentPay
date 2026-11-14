const assert = require('node:assert');
const { CHAINS, resolveChainId } = require('../config/chains');
const { validatePlan } = require('../src/solver');

assert.equal(resolveChainId('base'), 'base');
assert.equal(resolveChainId('Robinhood Chain'), 'robinhood');
assert.equal(resolveChainId('8453'), 'base');
assert.equal(CHAINS.arc.stable.decimals, 6);
assert.equal(CHAINS.base.chainId, 8453);
assert.equal(CHAINS.base.stable.symbol, 'USDC');
assert.equal(CHAINS.robinhood.stable.symbol, 'USDG');
assert.equal(CHAINS.robinhood.chainId, 4663);
assert.ok(CHAINS.base.quoter);
assert.equal(CHAINS.arc.quoter, null);

validatePlan({
  steps: [{ type: 'swap', fromAsset: 'USDC', toAsset: 'ETH', amount: 10, chain: 'base' }],
});

assert.throws(
  () => validatePlan({ steps: [{ type: 'swap', toAsset: 'ETH', amount: 0 }] }),
  /positive "amount"/
);

console.log('chains and swap plan ok');

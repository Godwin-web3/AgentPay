const assert = require('node:assert');
const { CHAINS, resolveChainId } = require('../config/chains');
const { validatePlan } = require('../src/solver');

assert.equal(resolveChainId('base'), 'base');
assert.equal(resolveChainId('Base Sepolia'), 'base');
assert.equal(resolveChainId('84532'), 'base');
assert.equal(resolveChainId('8453'), 'base-mainnet');
assert.equal(CHAINS.arc.stable.decimals, 6);
assert.equal(CHAINS.base.chainId, 84532);
assert.equal(CHAINS.base.testnet, true);
assert.equal(CHAINS['robinhood-testnet'].chainId, 46630);
assert.equal(CHAINS['robinhood-testnet'].testnet, true);
assert.equal(CHAINS.robinhood.testnet, false);
assert.equal(resolveChainId('robinhood'), 'robinhood-testnet');
assert.equal(resolveChainId('robinhood mainnet'), 'robinhood');
assert.equal(CHAINS['robinhood-testnet'].usdg.address, '0x42fa9A8085c0bc633Afa4e19a1f491db9a4dC0fE');
assert.equal(CHAINS['robinhood-testnet'].usdg.decimals, 6);
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

const { decideClaim } = require('../src/chainRegistry');

const vaultOnly = { status: 'deployed', vault: '0x1', executor: null, executorSkipped: true };
assert.equal(decideClaim(vaultOnly, Date.now()).won, false);

const deployed = { status: 'deployed', vault: '0x1', executor: '0x2' };
assert.equal(decideClaim(deployed, Date.now()).won, false);

const fresh = { status: 'deploying', startedAt: Date.now() };
assert.equal(decideClaim(fresh, Date.now()).won, false);

const stale = { status: 'deploying', startedAt: Date.now() - 21 * 60 * 1000 };
assert.equal(decideClaim(stale, Date.now()).won, true);
assert.equal(decideClaim(null, Date.now()).won, true);

console.log('chains and swap plan ok');

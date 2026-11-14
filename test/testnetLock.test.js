const assert = require('node:assert');
const { CHAINS, resolveChainId } = require('../config/chains');
const { quoteBridge } = require('../src/bridge');
const { executeSwap } = require('../src/swap');

for (const id of ['base', 'arc', 'robinhood-testnet']) {
  assert.equal(CHAINS[id].testnet, true, id + ' must stay a testnet');
}
for (const id of ['base-mainnet', 'robinhood', 'ethereum']) {
  assert.equal(CHAINS[id].testnet, false, id + ' must stay marked mainnet');
}

assert.equal(resolveChainId('robinhood'), 'robinhood-testnet');
assert.equal(resolveChainId('base'), 'base');
assert.equal(resolveChainId('8453'), 'base-mainnet');

(async () => {
  await assert.rejects(() => quoteBridge({ from: 'base-mainnet', to: 'arc', amount: 1 }), /testnet/);
  await assert.rejects(() => quoteBridge({ from: 'base', to: 'ethereum', amount: 1 }), /testnet|USDC/);
  await assert.rejects(() => quoteBridge({ from: 'robinhood', to: 'base', amount: 1 }), /USDC|testnet/);
  for (const chain of ['ethereum', 'base-mainnet', 'robinhood mainnet']) {
    const result = await executeSwap({ chain, fromAsset: 'USDC', toAsset: 'ETH', amount: 1 });
    assert.equal(result.executed, false, chain);
    assert.equal(result.success, false, chain);
    assert.match(result.reason, /mainnet/);
  }
  console.log('testnet lock ok');
})().catch((err) => {
  console.error(err);
  process.exit(1);
});

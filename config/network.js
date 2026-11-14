// Back-compat object. Fields follow the active chain (CHAIN env, default arc).
const { getChain } = require('../src/chain');

function current() {
  const c = getChain();
  return {
    id: c.id,
    name: c.name,
    chainId: c.chainId,
    rpc: c.rpc,
    ws: c.ws,
    explorer: c.explorer,
    usdc: c.stable.address,
    usdcDecimals: Number(process.env.USDC_DECIMALS) || c.stable.decimals,
    stableSymbol: c.stable.symbol,
    weth: c.weth,
    swapRouter: c.swapRouter,
    quoter: c.quoter,
    gateway: c.gateway,
  };
}

const net = {};
for (const key of [
  'id', 'name', 'chainId', 'rpc', 'ws', 'explorer', 'usdc', 'usdcDecimals',
  'stableSymbol', 'weth', 'swapRouter', 'quoter', 'gateway',
]) {
  Object.defineProperty(net, key, {
    enumerable: true,
    get() { return current()[key]; },
  });
}

module.exports = net;

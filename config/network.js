const { getChain } = require('./chains');

const chain = getChain();

module.exports = {
  key: chain.key,
  name: chain.name,
  chainId: chain.chainId,
  rpc: chain.rpc,
  ws: chain.ws,
  explorer: chain.explorer,
  usdc: chain.usdc,
  // ERC-20 USDC decimals used by AgentVault. Not native gas decimals.
  usdcDecimals: chain.usdcDecimals,
  nativeCurrency: chain.nativeCurrency,
  gateway: chain.gateway
};

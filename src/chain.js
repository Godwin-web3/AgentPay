const { ethers } = require('ethers');
const { CHAINS, listChains, resolveChainId } = require('../config/chains');

function activeId() {
  return resolveChainId(process.env.CHAIN || 'arc') || 'arc';
}

function getChain(id) {
  const key = id ? resolveChainId(id) : activeId();
  if (!key || !CHAINS[key]) {
    const known = Object.keys(CHAINS).join(', ');
    throw new Error(`Unknown chain "${id || activeId()}". Known: ${known}`);
  }
  return CHAINS[key];
}

function rpcFor(chain) {
  if (chain.id === 'arc' && process.env.ARC_RPC) return process.env.ARC_RPC;
  if (chain.id === activeId() && process.env.RPC_URL) return process.env.RPC_URL;
  return chain.rpc;
}

function getProvider(id) {
  const chain = getChain(id);
  const rpc = rpcFor(chain);
  return new ethers.JsonRpcProvider(
    rpc,
    { chainId: chain.chainId, name: chain.id },
    { staticNetwork: true }
  );
}

function txUrl(chain, hash) {
  if (!hash) return null;
  return `${chain.explorer}/tx/${hash}`;
}

module.exports = {
  CHAINS,
  listChains,
  resolveChainId,
  activeId,
  getChain,
  getProvider,
  rpcFor,
  txUrl,
};

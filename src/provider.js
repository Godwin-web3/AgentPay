const { ethers } = require('ethers');

const provider = new ethers.JsonRpcProvider(
  process.env.ARC_RPC,
  { chainId: 5042002, name: 'arc-testnet' },
  { staticNetwork: true }
);

module.exports = provider;

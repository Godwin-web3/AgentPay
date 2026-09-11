/**
 * Chain adapters. Contracts are plain EVM. Only addresses, decimals, and RPC change.
 *
 * USDC on Arc has two faces that share one balance:
 *   native gas  — 18 decimals (eth_getBalance, wallet_addEthereumChain)
 *   ERC-20      — 6 decimals  (AgentVault deposit/execute, IERC20)
 * Other EVM chains: native is ETH (18), USDC ERC-20 is 6.
 *
 * Vault accounting always uses usdcDecimals (ERC-20). Never mix the two.
 */
const CHAINS = {
  arc: {
    key: 'arc',
    name: 'Arc Testnet',
    chainId: 5042002,
    chainIdHex: '0x4CEF52',
    rpc: process.env.ARC_RPC || 'https://rpc.testnet.arc.network',
    ws: process.env.ARC_WS || 'wss://rpc.testnet.arc.network',
    explorer: 'https://testnet.arcscan.app',
    nativeCurrency: { name: 'USDC', symbol: 'USDC', decimals: 18 },
    usdc: process.env.USDC_CONTRACT || '0x3600000000000000000000000000000000000000',
    usdcDecimals: Number(process.env.USDC_DECIMALS) || 6,
    faucet: 'https://faucet.circle.com',
    gateway: {
      wallet: '0x0077777d7EBA4688BDeF3E311b846F25870A19B9',
      minter: '0x0022222ABE238Cc2C7Bb1f21003F0a260052475B'
    }
  },
  'base-sepolia': {
    key: 'base-sepolia',
    name: 'Base Sepolia',
    chainId: 84532,
    chainIdHex: '0x14A34',
    rpc: process.env.BASE_SEPOLIA_RPC || 'https://sepolia.base.org',
    ws: process.env.BASE_SEPOLIA_WS || '',
    explorer: 'https://sepolia.basescan.org',
    nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 },
    usdc: process.env.BASE_SEPOLIA_USDC || '0x036CbD53842c5426634e7929541eC2318f3dCF7e',
    usdcDecimals: Number(process.env.USDC_DECIMALS) || 6,
    faucet: 'https://www.coinbase.com/faucets/base-ethereum-sepolia-faucet',
    gateway: { wallet: '', minter: '' }
  }
};

function getChain(key) {
  const id = key || process.env.CHAIN || process.env.CHAIN_KEY || 'arc';
  const chain = CHAINS[id];
  if (!chain) {
    throw new Error('Unknown chain "' + id + '". Known: ' + Object.keys(CHAINS).join(', '));
  }
  return chain;
}

module.exports = { CHAINS, getChain };

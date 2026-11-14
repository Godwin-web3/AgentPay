// One record per chain. Arc stays the default until CHAIN is set.
// Stable-token decimals are the ERC-20 the vault accounts in, not native gas.
// Arc gas is 18-decimal USDC. The vault's ERC-20 USDC on Arc is 6.

const CHAINS = {
  arc: {
    id: 'arc',
    name: 'Arc Testnet',
    testnet: true,
    chainId: 5042002,
    rpc: 'https://rpc.testnet.arc.network',
    ws: 'wss://rpc.testnet.arc.network',
    explorer: 'https://testnet.arcscan.app',
    gasSymbol: 'USDC',
    gasDecimals: 18,
    stable: {
      symbol: 'USDC',
      address: '0x3600000000000000000000000000000000000000',
      decimals: 6,
    },
    weth: null,
    swapRouter: null,
    quoter: null,
    gateway: {
      wallet: '0x0077777d7EBA4688BDeF3E311b846F25870A19B9',
      minter: '0x0022222ABE238Cc2C7Bb1f21003F0a260052475B',
    },
  },
  base: {
    id: 'base',
    name: 'Base Sepolia',
    testnet: true,
    chainId: 84532,
    rpc: 'https://sepolia.base.org',
    ws: null,
    explorer: 'https://sepolia.basescan.org',
    gasSymbol: 'ETH',
    gasDecimals: 18,
    stable: {
      symbol: 'USDC',
      address: '0x036CbD53842c5426634e7929541eC2318f3dCF7e',
      decimals: 6,
    },
    weth: '0x4200000000000000000000000000000000000006',
    swapRouter: '0x94cC0AaC535CCDB3C01d6787D6413C739ae12bc4',
    quoter: '0xC5290058841028F1614F3A6F0F5816cAd0df5E27',
    gateway: null,
  },
  'base-mainnet': {
    id: 'base-mainnet',
    name: 'Base',
    testnet: false,
    chainId: 8453,
    rpc: 'https://mainnet.base.org',
    ws: null,
    explorer: 'https://basescan.org',
    gasSymbol: 'ETH',
    gasDecimals: 18,
    stable: {
      symbol: 'USDC',
      address: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913',
      decimals: 6,
    },
    weth: '0x4200000000000000000000000000000000000006',
    swapRouter: '0x2626664c2603336E57B271c5C0b26F421741e481',
    quoter: '0x3d4e44Eb1374240CE5F1B871ab261CD16335B76a',
    gateway: null,
  },
  ethereum: {
    id: 'ethereum',
    name: 'Ethereum',
    testnet: false,
    chainId: 1,
    rpc: 'https://ethereum.publicnode.com',
    ws: null,
    explorer: 'https://etherscan.io',
    gasSymbol: 'ETH',
    gasDecimals: 18,
    stable: {
      symbol: 'USDC',
      address: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48',
      decimals: 6,
    },
    weth: '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2',
    swapRouter: '0x68b3465833fb72A70ecDF485E0e4C7bD8665Fc45',
    quoter: '0x61fFE014bA17989E743c5F6cB21bF9697530B21e',
    gateway: null,
  },
  robinhood: {
    id: 'robinhood',
    name: 'Robinhood Chain',
    testnet: false,
    chainId: 4663,
    rpc: 'https://rpc.mainnet.chain.robinhood.com',
    ws: null,
    explorer: 'https://robinhoodchain.blockscout.com',
    gasSymbol: 'ETH',
    gasDecimals: 18,
    // Canonical stable is Paxos USDG, not USDC.
    stable: {
      symbol: 'USDG',
      address: '0x5fc5360D0400a0Fd4f2af552ADD042D716F1d168',
      decimals: 6,
    },
    weth: '0x0Bd7D308f8E1639FAb988df18A8011f41EAcAD73',
    swapRouter: '0xCaf681a66D020601342297493863E78C959E5cb2',
    quoter: '0x33e885ed0ec9bf04ecfb19341582aadcb4c8a9e7',
    gateway: null,
  },
  'robinhood-testnet': {
    id: 'robinhood-testnet',
    name: 'Robinhood Chain Testnet',
    testnet: true,
    chainId: 46630,
    rpc: 'https://rpc.testnet.chain.robinhood.com',
    ws: null,
    explorer: 'https://explorer.testnet.chain.robinhood.com',
    gasSymbol: 'ETH',
    gasDecimals: 18,
    // The testnet faucet mints stock tokens, not USDG. TSLA is the vault asset
    // until a testnet stable exists. 18 decimals, matching the token.
    stable: {
      symbol: 'TSLA',
      address: '0xC9f9c86933092BbbfFF3CCb4b105A4A94bf3Bd4E',
      decimals: 18,
    },
    weth: null,
    swapRouter: null,
    quoter: null,
    gateway: null,
  },
};

const ALIASES = {
  'arc testnet': 'arc',
  'base mainnet': 'base-mainnet',
  'base sepolia': 'base',
  sepolia: 'base',
  eth: 'ethereum',
  mainnet: 'ethereum',
  'robinhood chain': 'robinhood',
  'robinhood testnet': 'robinhood-testnet',
  hood: 'robinhood',
};

function listChains() {
  return Object.values(CHAINS);
}

function resolveChainId(name) {
  if (!name) return null;
  const key = String(name).trim().toLowerCase();
  if (CHAINS[key]) return key;
  if (ALIASES[key]) return ALIASES[key];
  const byNum = listChains().find((c) => String(c.chainId) === key);
  return byNum ? byNum.id : null;
}

module.exports = { CHAINS, ALIASES, listChains, resolveChainId };

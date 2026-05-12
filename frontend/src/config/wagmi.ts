import { getDefaultConfig, connectorsForWallets } from '@rainbow-me/rainbowkit';
import { 
  metaMaskWallet, 
  rainbowWallet, 
  coinbaseWallet, 
  walletConnectWallet, 
  trustWallet, 
  ledgerWallet, 
  braveWallet,
  injectedWallet,
  phantomWallet
} from '@rainbow-me/rainbowkit/wallets';
import { http } from 'wagmi';
import { type Chain } from 'viem';

const somniaTestnet = {
  id: 50312,
  name: 'Somnia Testnet',
  nativeCurrency: { name: 'STT', symbol: 'STT', decimals: 18 },
  rpcUrls: {
    default: { http: ['https://dream-rpc.somnia.network'] },
    public: { http: ['https://dream-rpc.somnia.network'] },
  },
  blockExplorers: {
    default: { name: 'Somnia Explorer', url: 'https://shannon-explorer.somnia.network' },
  },
  testnet: true,
} as const satisfies Chain;

const somniaMainnet = {
  id: 5031,
  name: 'Somnia Mainnet',
  nativeCurrency: { name: 'SOMI', symbol: 'SOMI', decimals: 18 },
  rpcUrls: {
    default: { http: ['https://api.infra.mainnet.somnia.network/'] },
    public: { http: ['https://api.infra.mainnet.somnia.network/'] },
  },
  blockExplorers: {
    default: { name: 'Somnia Explorer', url: 'https://explorer.somnia.network' },
  },
  testnet: false,
} as const satisfies Chain;

const projectId = '3bff84f132ba9e2f67a5aec8b6d3703f';

const connectors = connectorsForWallets(
  [
    {
      groupName: 'Recommended',
      wallets: [
        injectedWallet,
        metaMaskWallet,
        rainbowWallet,
        coinbaseWallet,
        walletConnectWallet,
        trustWallet,
        ledgerWallet,
        braveWallet,
        phantomWallet
      ],
    },
  ],
  { appName: 'AgentPay', projectId }
);

export const config = getDefaultConfig({
  appName: 'AgentPay',
  projectId,
  chains: [somniaTestnet, somniaMainnet],
  transports: {
    [somniaTestnet.id]: http(),
    [somniaMainnet.id]: http(),
  },
  connectors,
});

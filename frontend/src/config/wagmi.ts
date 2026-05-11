import { getDefaultConfig, Chain } from '@rainbow-me/rainbowkit';
import { http } from 'wagmi';

const somniaTestnet: Chain = {
  id: 50312,
  name: 'Somnia Testnet',
  nativeCurrency: { name: 'STT', symbol: 'STT', decimals: 18 },
  rpcUrls: {
    default: { http: ['https://dream-rpc.somnia.network'] },
    public: { http: ['https://dream-rpc.somnia.network'] },
  },
  blockExplorers: {
    default: { name: 'Somnia Explorer', url: 'https://explorer-testnet.somnia.network' },
  },
  testnet: true,
};

const somniaMainnet: Chain = {
  id: 5031,
  name: 'Somnia Mainnet',
  nativeCurrency: { name: 'STT', symbol: 'STT', decimals: 18 },
  rpcUrls: {
    default: { http: ['https://api.infra.mainnet.somnia.network/'] },
    public: { http: ['https://api.infra.mainnet.somnia.network/'] },
  },
  blockExplorers: {
    default: { name: 'Somnia Explorer', url: 'https://explorer.somnia.network' },
  },
  testnet: false,
};

export const config = getDefaultConfig({
  appName: 'Somnia AgentPay',
  projectId: 'YOUR_WALLETCONNECT_PROJECT_ID', // User should replace this
  chains: [somniaTestnet, somniaMainnet],
  transports: {
    [somniaTestnet.id]: http(),
    [somniaMainnet.id]: http(),
  },
});

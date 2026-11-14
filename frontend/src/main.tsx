import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { PrivyProvider } from '@privy-io/react-auth'
import { defineChain } from 'viem'
import { baseSepolia } from 'viem/chains'
import './index.css'
import Root from './App.tsx'

const robinhoodTestnet = defineChain({
  id: 46630,
  name: 'Robinhood Chain Testnet',
  network: 'robinhood-testnet',
  nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 },
  rpcUrls: { default: { http: ['https://rpc.testnet.chain.robinhood.com'] } },
  blockExplorers: { default: { name: 'Explorer', url: 'https://explorer.testnet.chain.robinhood.com' } },
})

const arcTestnet = defineChain({
  id: 5042002,
  name: 'Arc Testnet',
  network: 'arc-testnet',
  nativeCurrency: { name: 'USDC', symbol: 'USDC', decimals: 18 },
  rpcUrls: { default: { http: ['https://rpc.testnet.arc.network'] } },
  blockExplorers: { default: { name: 'Arcscan', url: 'https://testnet.arcscan.app' } },
})

createRoot(document.getElementById('root')!).render(
  <PrivyProvider
    appId="cmwg5h2kg00q20hl5uashrs2w"
    config={{
      loginMethods: ['google'],
      appearance: { theme: 'light', accentColor: '#161513' },
      defaultChain: baseSepolia,
      supportedChains: [baseSepolia, robinhoodTestnet, arcTestnet],
      embeddedWallets: {
        ethereum: { createOnLogin: 'users-without-wallets' },
      },
    }}
  >
    <StrictMode>
      <Root />
    </StrictMode>
  </PrivyProvider>,
)
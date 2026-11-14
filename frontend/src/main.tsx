import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { PrivyProvider } from '@privy-io/react-auth'
import './index.css'
import Root from './App.tsx'

createRoot(document.getElementById('root')!).render(
  <PrivyProvider
    appId="cmwg5h2kg00q20hl5uashrs2w"
    config={{
      loginMethods: ['google'],
      appearance: { theme: 'light', accentColor: '#161513' },
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

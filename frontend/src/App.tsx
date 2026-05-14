import { useState, useEffect } from 'react'
import AgentHeader from './components/AgentHeader'
import Terminal from './views/Terminal'
import Policy from './views/Policy'
import Landing from './views/Landing'
import Profile from './views/Profile'
import type { ChatMessage } from './types'
import { getTokenBalances } from './api'

type View = 'landing' | 'terminal' | 'account' | 'profile' | 'policy' | 'history'

const TerminalIcon = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="4 17 10 11 4 5"/>
    <line x1="12" y1="19" x2="20" y2="19"/>
  </svg>
)
const AccountIcon = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="12" cy="8" r="4"/>
    <path d="M4 20c0-4 3.6-7 8-7s8 3 8 7"/>
  </svg>
)
const navItems = [
  { id: 'terminal', icon: TerminalIcon, label: 'Terminal' },
  { id: 'account',  icon: AccountIcon,  label: 'Account'  },
] as const

export default function App() {
  const [view, setView] = useState<View>('landing')
  const [userAddress, setUserAddress] = useState('')
  const [vaultBalance, setVaultBalance] = useState('0')
  const [activeProvider, setActiveProvider] = useState<any>(null)
  const [walletBalance, setWalletBalance] = useState('0')
  const [tokenBalances, setTokenBalances] = useState<Record<string,string>>({})
  const [messages, setMessages] = useState<ChatMessage[]>(() => [{
    role: 'assistant',
    content: 'AgentPay online. I can send payments, manage schedules, and enforce your policy. What do you need?',
    timestamp: Date.now()
  }])

  useEffect(() => {
    getTokenBalances(userAddress).then(setTokenBalances).catch(console.error)
  }, [userAddress])


  if (view === 'landing') {
    return <Landing onLaunch={() => setView('terminal')} />
  }

  return (
    <div className="app">
      {/* Desktop Sidebar */}
      <aside className="sidebar">
        <div className="sidebar-logo">
          <h1>AGENTPAY</h1>
          <span>SOMNIA NETWORK</span>
        </div>

        <nav style={{ flex: 1 }}>
          {navItems.map(item => (
            <div
              key={item.id}
              className={`nav-item ${view === item.id ? 'active' : ''}`}
              onClick={() => setView(item.id as View)}
            >
              <span className="nav-icon"><item.icon /></span>
              <span>{item.label}</span>
            </div>
          ))}
        </nav>
      </aside>

      {/* Main Content Area */}
      <main className="main">
        <AgentHeader onAddressChange={setUserAddress} onBalanceChange={(v, w) => { setVaultBalance(v); setWalletBalance(w) }} onProviderChange={setActiveProvider} />
        
        <div className="view-content">
          {view === 'terminal' && <Terminal messages={messages} setMessages={setMessages} userAddress={userAddress} />}
          {view === 'account'  && <Profile userAddress={userAddress} vaultBalance={vaultBalance} walletBalance={walletBalance} tokenBalances={tokenBalances} activeProvider={activeProvider} />}
          {view === 'policy'   && <Policy userAddress={userAddress} />}
        </div>
      </main>

      {/* Mobile Bottom Navigation */}
      <nav className="mobile-nav">
        {navItems.map(item => (
          <div
            key={item.id}
            className={`mobile-nav-item ${view === item.id ? 'active' : ''}`}
            onClick={() => setView(item.id as View)}
          >
            <span className="mobile-nav-icon"><item.icon /></span>
            <span>{item.label}</span>
          </div>
        ))}
      </nav>
    </div>
  )
}

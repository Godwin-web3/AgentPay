import { useState, useEffect } from 'react'
import AgentHeader from './components/AgentHeader'
import Terminal from './views/Terminal'
import Policy from './views/Policy'
import Schedules from './views/Schedules'
import History from './views/History'
import Landing from './views/Landing'
import Profile from './views/Profile'
import Onboarding from './views/Onboarding'
import type { ChatMessage } from './types'
import { getTokenBalances } from './api'

type View = 'landing' | 'terminal' | 'account' | 'profile' | 'policy' | 'history' | 'schedules'

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
const ScheduleIcon = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
    <rect x="3" y="4" width="18" height="18" rx="2" ry="2"/>
    <line x1="16" y1="2" x2="16" y2="6"/>
    <line x1="8" y1="2" x2="8" y2="6"/>
    <line x1="3" y1="10" x2="21" y2="10"/>
  </svg>
)
const HistoryIcon = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
    <path d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"/>
  </svg>
)
const navItems = [
  { id: 'terminal', icon: TerminalIcon, label: 'Terminal' },
  { id: 'schedules', icon: ScheduleIcon, label: 'Schedules' },
  { id: 'history',   icon: HistoryIcon,  label: 'History'   },
  { id: 'account',   icon: AccountIcon,  label: 'Account'   },
] as const

export default function App() {
  const [historyKey, setHistoryKey] = useState(0)
  const [view, setView] = useState<View>(() => (localStorage.getItem('agentpay_view') as View) || 'landing')
  const [userAddress, setUserAddress] = useState(() => localStorage.getItem('agentpay_address') || '')
  const [isOnboarded, setIsOnboarded] = useState(false)

  useEffect(() => {
    localStorage.setItem('agentpay_view', view)
  }, [view])

  useEffect(() => {
    localStorage.setItem('agentpay_address', userAddress)
    if (userAddress) {
      const onboarded = localStorage.getItem(`agentpay_onboarded_${userAddress}`) === 'true'
      setIsOnboarded(onboarded)
    } else {
      setIsOnboarded(false)
    }
  }, [userAddress])

  const [vaultBalance, setVaultBalance] = useState('0')
  const [activeProvider, setActiveProvider] = useState<any>(null)
  const [walletBalance, setWalletBalance] = useState('0')
  const [tokenBalances, setTokenBalances] = useState<Record<string,string>>({})
  const [refreshKey, setRefreshKey] = useState(0)

  const [messages, setMessages] = useState<ChatMessage[]>(() => {
    const saved = localStorage.getItem(`agentpay_chat_${userAddress}`)
    if (saved) return JSON.parse(saved)
    return [{
      role: 'assistant',
      content: 'AgentPay online. I can send payments, manage schedules, and enforce your policy. What do you need?',
      timestamp: Date.now()
    }]
  })

  useEffect(() => {
    if (userAddress) {
      localStorage.setItem(`agentpay_chat_${userAddress}`, JSON.stringify(messages))
    }
  }, [messages, userAddress])

  const refreshBalances = async (delay = 0) => {
    setRefreshKey(prev => prev + 1)
    if (!userAddress) return
    if (delay) await new Promise(r => setTimeout(r, delay))
    try {
      const balances = await getTokenBalances(userAddress)
      setTokenBalances(balances)
    } catch (e) {
      console.error('Failed to refresh balances', e)
    }
  }

  useEffect(() => {
    if (userAddress) {
      refreshBalances()
    }
  }, [userAddress])

  async function handleClearMemory() {
    const serverUrl = import.meta.env.VITE_WORKER_URL || 'https://agentpay-c4o7.onrender.com'
    await fetch(`${serverUrl}/chat`, {
      method: 'DELETE',
      headers: { 'x-user-address': userAddress }
    }).catch(() => {})
    setMessages([{ role: 'assistant', content: 'Memory cleared.', timestamp: Date.now() }])
  }


  if (view === 'landing') {
    return <Landing onLaunch={() => setView('terminal')} />
  }

  if (userAddress && !isOnboarded) {
    return (
      <div className="app">
        <main className="main" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--bg)' }}>
           <Onboarding userAddress={userAddress} onComplete={() => setIsOnboarded(true)} />
        </main>
      </div>
    )
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
              onClick={() => { if (item.id === 'history') setHistoryKey(k => k + 1); setView(item.id as View) }}
            >
              <span className="nav-icon"><item.icon /></span>
              <span>{item.label}</span>
            </div>
          ))}
        </nav>
      </aside>

      {/* Main Content Area */}
      <main className="main">
        <AgentHeader 
          onAddressChange={setUserAddress} 
          onBalanceChange={(v, w) => { setVaultBalance(v); setWalletBalance(w) }} 
          onProviderChange={setActiveProvider} 
          currentView={view} 
          onNavigate={(v) => setView(v as View)} 
          onClearMemory={handleClearMemory} 
          refreshTrigger={refreshKey}
        />
        
        <div className="view-content">
          {view === 'terminal' && <Terminal messages={messages} setMessages={setMessages} userAddress={userAddress} onActionSuccess={refreshBalances} />}
          {view === 'schedules' && <Schedules userAddress={userAddress} />}
          {view === 'history' && <History key={historyKey} userAddress={userAddress} />}
          {view === 'account'  && <Profile userAddress={userAddress} vaultBalance={vaultBalance} walletBalance={walletBalance} tokenBalances={tokenBalances} activeProvider={activeProvider} onActionSuccess={refreshBalances} />}
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

import { useState, useEffect } from 'react'
import { AuthProvider, useAuth } from './contexts/AuthContext'
import ClaimTag from './components/ClaimTag'
import AgentHeader from './components/AgentHeader'
import ErrorBoundary from './components/ErrorBoundary'
import Terminal from './views/Terminal'
import Policy from './views/Policy'
import Schedules from './views/Schedules'
import Jobs from './views/Jobs'
import Marketplace from './views/Marketplace'
import Agent from './views/Agent'
import History from './views/History'
import Landing from './views/Landing'
import Profile from './views/Profile'
import Onboarding from './views/Onboarding'
import type { ChatMessage } from './types'
import { getTokenBalances, checkVault, getWallet, getVaultAddress, getVaultBalance } from './api'

type View = 'landing' | 'terminal' | 'account' | 'profile' | 'policy' | 'history' | 'schedules' | 'jobs' | 'marketplace' | 'agent'

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
const MarketplaceIcon = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
    <path d="M3 9l1.5-5h15L21 9"/>
    <path d="M3 9h18v10a2 2 0 01-2 2H5a2 2 0 01-2-2V9z"/>
    <line x1="9" y1="13" x2="15" y2="13"/>
  </svg>
)
const JobsIcon = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
    <rect x="3" y="7" width="18" height="13" rx="2" ry="2"/>
    <path d="M8 7V5a2 2 0 012-2h4a2 2 0 012 2v2"/>
  </svg>
)
const AgentIcon = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
    <rect x="4" y="8" width="16" height="12" rx="2" ry="2"/>
    <line x1="12" y1="2" x2="12" y2="8"/>
    <circle cx="9" cy="14" r="1"/>
    <circle cx="15" cy="14" r="1"/>
  </svg>
)
const navItems = [
  { id: 'terminal', icon: TerminalIcon, label: 'Terminal' },
  { id: 'marketplace', icon: MarketplaceIcon, label: 'Marketplace' },
  { id: 'jobs', icon: JobsIcon, label: 'Jobs' },
  { id: 'schedules', icon: ScheduleIcon, label: 'Schedules' },
  { id: 'agent', icon: AgentIcon, label: 'Agent' },
  { id: 'history',   icon: HistoryIcon,  label: 'History'   },
  { id: 'account',   icon: AccountIcon,  label: 'Account'   },
] as const

function App({ tag }: { tag: string | null }) {
  const { walletAddress: authWalletAddress, uid: authUid } = useAuth();
  const [historyKey, setHistoryKey] = useState(0)
  const [view, setView] = useState<View>(() => (localStorage.getItem('agentpay_view') as View) || 'landing')

  useEffect(() => {
    function setAppHeight() {
      const vh = window.visualViewport ? window.visualViewport.height : window.innerHeight
      document.documentElement.style.setProperty('--app-height', vh + 'px')
    }
    setAppHeight()
    if (window.visualViewport) {
      window.visualViewport.addEventListener('resize', setAppHeight)
      return () => window.visualViewport?.removeEventListener('resize', setAppHeight)
    } else {
      window.addEventListener('resize', setAppHeight)
      return () => window.removeEventListener('resize', setAppHeight)
    }
  }, [])
  const [userAddress, setUserAddress] = useState(() => localStorage.getItem('agentpay_address') || '')

  const [userId, setUserId] = useState(() => localStorage.getItem('agentpay_uid') || '')

  useEffect(() => {
    if (authWalletAddress) {
      setUserAddress(authWalletAddress);
      if (view === 'landing') setView('terminal');
    }
  }, [authWalletAddress]);

  useEffect(() => {
    if (authUid) {
      setUserId(authUid);
      localStorage.setItem('agentpay_uid', authUid);
    }
  }, [authUid]);
  const [isOnboarded, setIsOnboarded] = useState(false)
  const [onboardCheckDone, setOnboardCheckDone] = useState(false)
  const [agentWalletAddress, setAgentWalletAddress] = useState('')
  const [vaultAddress, setVaultAddress] = useState('')

  useEffect(() => {
    localStorage.setItem('agentpay_view', view)
  }, [view])

  useEffect(() => {
    localStorage.setItem('agentpay_address', userAddress)
    if (!userAddress) {
      setIsOnboarded(false)
      setOnboardCheckDone(true)
      return
    }
    if (!userId) return
    setOnboardCheckDone(false)
    checkVault(userId)
      .then(result => {
        setIsOnboarded(!!result.exists)
      })
      .catch(e => {
        console.error('Vault check failed', e)
        setIsOnboarded(false)
      })
      .finally(() => setOnboardCheckDone(true))
  }, [userAddress, userId])

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
    setHistoryKey(k => k + 1)
    if (!userAddress) return
    if (delay) await new Promise(r => setTimeout(r, delay))
    try {
      const balances = await getTokenBalances(userAddress)
      setTokenBalances(balances)
      setWalletBalance(balances.USDC || '0')
    } catch (e) {
      console.error('Failed to refresh real wallet balance', e)
    }
    let resolvedAgentWallet = agentWalletAddress
    try {
      const wallet = await getWallet(userId)
      resolvedAgentWallet = wallet.address
      setAgentWalletAddress(wallet.address)
    } catch (e) {
      console.error('Failed to refresh agent wallet balance', e)
    }
    try {
      const { address: resolvedVault } = await getVaultAddress(userId)
      if (resolvedVault) setVaultAddress(resolvedVault)
      if (resolvedVault && resolvedAgentWallet) {
        const vBal = await getVaultBalance(resolvedVault, resolvedAgentWallet)
        setVaultBalance(vBal)
      }
    } catch (e) {
      console.error('Failed to refresh vault balance', e)
    }
  }

  useEffect(() => {
    if (userAddress) {
      refreshBalances()
    }
  }, [userAddress])

  useEffect(() => {
    if (!userAddress) return
    const interval = setInterval(() => {
      refreshBalances()
    }, 30000)
    return () => clearInterval(interval)
  }, [userAddress])

  async function handleClearMemory() {
    const { clearChatHistory } = await import('./api')
    await clearChatHistory(userId).catch(() => {})
    setMessages([{ role: 'assistant', content: 'Memory cleared.', timestamp: Date.now() }])
  }


  if (view === 'landing') {
    return <Landing onLaunch={() => setView('terminal')} />
  }

  if (userAddress && !onboardCheckDone) {
    return (
      <div className="app">
        <main className="main" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--bg)' }}>
          <div style={{ color: 'var(--muted)', fontFamily: 'var(--font-mono)', fontSize: 13 }}>Checking vault status...</div>
        </main>
      </div>
    )
  }

  if (userAddress && onboardCheckDone && !isOnboarded) {
    return (
      <div className="app">
        <main className="main" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--bg)' }}>
           <Onboarding
             userAddress={userAddress}
             onProviderChange={setActiveProvider}
             onComplete={() => { setIsOnboarded(true); refreshBalances() }}
           />
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
          activeProvider={activeProvider}
          userAddress={userAddress}
        />
        
        <div className="view-content">
          <ErrorBoundary onReset={() => setView('terminal')}>
            {view === 'terminal' && <Terminal messages={messages} setMessages={setMessages} userAddress={userAddress} userId={userId} onActionSuccess={refreshBalances} />}
            {view === 'schedules' && <Schedules userAddress={userAddress} userId={userId} />}
            {view === 'history' && <History key={historyKey} refreshTrigger={historyKey} userAddress={userAddress} userId={userId} />}
            {view === 'account'  && <Profile userAddress={userAddress} userId={userId} vaultBalance={vaultBalance} walletBalance={walletBalance} tokenBalances={tokenBalances} activeProvider={activeProvider} onActionSuccess={refreshBalances} agentWalletAddress={vaultAddress || agentWalletAddress} agentWalletBalance={vaultBalance} tag={tag} />}
            {view === 'policy'   && <Policy userAddress={userAddress} userId={userId} />}
            {view === 'jobs' && <Jobs userAddress={userAddress} userId={userId} />}
            {view === 'marketplace' && <Marketplace userAddress={userAddress} userId={userId} />}
            {view === 'agent' && <Agent />}
          </ErrorBoundary>
        </div>
      </main>

      {/* Mobile Bottom Navigation */}
      <nav className="mobile-nav">
        {navItems.map(item => (
          <div
            key={item.id}
            className={`mobile-nav-item ${view === item.id ? 'active' : ''}`}
            onClick={() => { if (item.id === 'history') setHistoryKey(k => k + 1); setView(item.id as View) }}
          >
            <span className="mobile-nav-icon"><item.icon /></span>
            <span>{item.label}</span>
          </div>
        ))}
      </nav>
    </div>
  )
}

function AppWithAuth() {
  const { user, loading, signInWithGoogle } = useAuth();
  const [tag, setTag] = useState<string | null>(null);
  const [tagLoading, setTagLoading] = useState(false);
  const [tagChecked, setTagChecked] = useState(false);

  useEffect(() => {
    if (!user) {
      setTagLoading(false);
      return;
    }
    setTagLoading(true);
    const fetchWithTimeout = (ms: number) => {
      const timeout = new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), ms));
      return import('./api').then(({ getMe }) => Promise.race([getMe(user.uid), timeout]));
    };

    fetchWithTimeout(8000)
      .catch(() => fetchWithTimeout(15000))
      .then((me: any) => {
        setTag(me.tag || null);
        setTagChecked(true);
      })
      .catch(() => {
        setTagChecked(false);
      })
      .finally(() => setTagLoading(false));
  }, [user]);

  if (loading || tagLoading) return (
    <div style={{ minHeight: '100vh', background: '#0A0A0A', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <p style={{ color: '#4fdbc8' }}>Loading...</p>
    </div>
  );
  if (!user) return <Landing onLaunch={async () => { try { await signInWithGoogle(); } catch {} }} />;
  if (tagChecked && !tag) return <ClaimTag onClaimed={(t) => { localStorage.setItem('agentpay_view', 'terminal'); setTag(t || 'skip'); }} />;
  return <App tag={tag} />;
}

export default function Root() {
  return (
    <AuthProvider>
      <AppWithAuth />
    </AuthProvider>
  );
}

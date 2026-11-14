import { useState, useEffect } from 'react'
import { AuthProvider, useAuth } from './contexts/AuthContext'
import ClaimTag from './components/ClaimTag'
import ClaimFunds from './components/ClaimFunds'
import AgentHeader from './components/AgentHeader'
import ErrorBoundary from './components/ErrorBoundary'
import Terminal from './views/Terminal'
import Policy from './views/Policy'
import Goals from './views/Goals'
import Pools from './views/Pools'
import History from './views/History'
import Landing from './views/Landing'
import Profile from './views/Profile'
import Login from './components/Login'
import { PaymentRequestView } from './views/PaymentRequestView'
import type { ChatMessage } from './types'
import { getTokenBalances, getWallet, getVaultBalanceApi } from './api'

type View = 'landing' | 'terminal' | 'account' | 'profile' | 'policy' | 'history' | 'goals' | 'pools' | 'requests'

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
const HistoryIcon = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
    <path d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"/>
  </svg>
)
const navItems = [
  { id: 'terminal', icon: TerminalIcon, label: 'Terminal' },
  { id: 'account', icon: AccountIcon, label: 'Account' },
  { id: 'history', icon: HistoryIcon, label: 'History' },
] as const

function App({ tag }: { tag: string | null }) {
  const { walletAddress: authWalletAddress, uid: authUid } = useAuth();
  const [historyKey, setHistoryKey] = useState(0)
  const [view, setView] = useState<View>(() => {
    const stored = localStorage.getItem('agentpay_view')
    // Schedules was folded into Goals — a stale stored value would otherwise render a blank view.
    const allowed = ['terminal', 'account', 'history', 'landing', 'login']
    if (!stored || !allowed.includes(stored)) return 'terminal'
    return (stored as View) || 'landing'
  })

  useEffect(() => {
    function setAppHeight() {
      const vh = window.visualViewport ? window.visualViewport.height : window.innerHeight
      document.documentElement.style.setProperty('--app-height', vh + 'px')
      const keyboardOpen = window.innerHeight - vh > 150
      document.documentElement.classList.toggle('keyboard-open', keyboardOpen)
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
  const [agentWalletAddress, setAgentWalletAddress] = useState('')

  useEffect(() => {
    localStorage.setItem('agentpay_view', view)
  }, [view])

  useEffect(() => {
    localStorage.setItem('agentpay_address', userAddress)
  }, [userAddress])

  const [vaultBalance, setVaultBalance] = useState('0')
  const [positions, setPositions] = useState<{ label: string; amount: string }[]>([])
  const [stocks, setStocks] = useState<{ symbol: string; amount: string }[]>([])
  const [activeProvider, setActiveProvider] = useState<any>(null)
  const [walletBalance, setWalletBalance] = useState('0')
  const [tokenBalances, setTokenBalances] = useState<Record<string,string>>({})
  const [refreshKey, setRefreshKey] = useState(0)

  const [messages, setMessages] = useState<ChatMessage[]>(() => {
    const saved = localStorage.getItem(`agentpay_chat_${userAddress}`)
    if (saved) return JSON.parse(saved)
    return [{
      role: 'assistant',
      content: 'Say what you want moved. Nothing happens until you confirm.',
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
    let arcWallet = walletBalance
    try {
      const balances = await getTokenBalances(userAddress)
      setTokenBalances(balances)
      arcWallet = balances.USDC || '0'
      setWalletBalance(arcWallet)
    } catch (e) {
      console.error('Failed to refresh real wallet balance', e)
    }
    try {
      const wallet = await getWallet(userId)
      setAgentWalletAddress(wallet.address)
    } catch (e) {
      console.error('Failed to refresh agent wallet balance', e)
    }
    try {
      const api = await getVaultBalanceApi(userId)
      const rows: { label: string; amount: string }[] = []
      const base = api.chains?.find((c) => c.id === 'base')
      const arc = api.chains?.find((c) => c.id === 'arc')
      if (base) {
        rows.push({ label: 'Base Sepolia vault', amount: Number(base.vault).toFixed(2) })
        rows.push({ label: 'Base Sepolia wallet', amount: Number(base.wallet).toFixed(2) })
      }
      if (arc && Number(arc.vault) > 0) {
        rows.push({ label: 'Arc vault', amount: Number(arc.vault).toFixed(2) })
      }
      if (Number(arcWallet) > 0 && !rows.some((row) => row.label === 'Arc wallet')) {
        rows.push({ label: 'Arc wallet', amount: Number(arcWallet).toFixed(2) })
      }
      const hood = api.chains?.find((c) => c.id === 'robinhood-testnet')
      setStocks(hood?.tokens || [])
      const total = rows.reduce((sum, row) => sum + Number(row.amount), 0)
      setPositions(rows)
      setVaultBalance((rows.length ? total : Number(api.balance || 0)).toFixed(2))
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

  return (
    <div className="app">
      {/* Desktop Sidebar */}
      <aside className="sidebar">
        <div className="sidebar-logo">
          <h1>AgentPay</h1>
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
          onBalanceChange={() => {}} 
          onProviderChange={setActiveProvider} 
          currentView={view} 
          onNavigate={(v) => setView(v as View)} 
          onClearMemory={handleClearMemory} 
          refreshTrigger={refreshKey}
          activeProvider={activeProvider}
          userAddress={userAddress}
          tag={tag}
        />
        
        <div className="view-content">
          <ErrorBoundary onReset={() => setView('terminal')}>
            {view === 'terminal' && <Terminal messages={messages} setMessages={setMessages} userAddress={userAddress} userId={userId} onActionSuccess={refreshBalances} />}
            {view === 'requests' && <PaymentRequestView />}
            {view === 'history' && <History key={historyKey} refreshTrigger={historyKey} userAddress={userAddress} userId={userId} />}
            {view === 'account'  && <Profile userAddress={userAddress} userId={userId} vaultBalance={vaultBalance} positions={positions} stocks={stocks} walletBalance={walletBalance} tokenBalances={tokenBalances} activeProvider={activeProvider} onActionSuccess={refreshBalances} agentWalletAddress={agentWalletAddress} agentWalletBalance={vaultBalance} tag={tag} />}
            {view === 'policy'   && <Policy userAddress={userAddress} userId={userId} />}
            {view === 'goals' && <Goals userAddress={userAddress} userId={userId} />}
            {view === 'pools' && <Pools userAddress={userAddress} userId={userId} />}
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
  const { user, loading } = useAuth();
  const [tag, setTag] = useState<string | null>(null);
  const [claimed, setClaimed] = useState(false);
  const [authView, setAuthView] = useState<'landing' | 'login'>('landing');
  const [tagLoading, setTagLoading] = useState(false);
  const [tagChecked, setTagChecked] = useState(false);

  useEffect(() => {
    if (!user) {
      setTagLoading(false);
      setClaimed(false);
      return;
    }
    setClaimed(localStorage.getItem('agentpay_test_claimed_v3_' + user.uid) === '1');
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
  if (!user) return authView === 'landing'
    ? <Landing onLaunch={() => setAuthView('login')} />
    : <Login onBack={() => setAuthView('landing')} />;
  if (tagChecked && !tag) return <ClaimTag onClaimed={(t) => { localStorage.setItem('agentpay_view', 'terminal'); setTag(t || 'skip'); }} />;
  if (!claimed) return <ClaimFunds userId={user.uid} onDone={() => { localStorage.setItem('agentpay_test_claimed_v3_' + user.uid, '1'); setClaimed(true); }} />;
  return <App tag={tag} />;
}

export default function Root() {
  return (
    <AuthProvider>
      <AppWithAuth />
    </AuthProvider>
  );
}

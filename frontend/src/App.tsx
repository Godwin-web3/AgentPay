import { useState, useEffect } from 'react'
import Landing from './views/Landing'
import Sidebar from './components/Sidebar'
import TopBar from './components/TopBar'
import Terminal from './views/Terminal'
import Dashboard from './views/Dashboard'
import Policy from './views/Policy'
import Agents from './views/Agents'
import Ledger from './views/Ledger'
import Register from './views/Register'
import { useAccount } from 'wagmi'

export type Tab = 'terminal' | 'dashboard' | 'policy' | 'agents' | 'ledger' | 'register'

export default function App() {
  const { isConnected } = useAccount()
  const [showApp, setShowApp] = useState(false)
  const [tab, setTab] = useState<Tab>('terminal')
  const [isCollapsed, setIsCollapsed] = useState(false)
  const [apiKey, setApiKey] = useState(localStorage.getItem('ap_key') || '')

  useEffect(() => {
    const key = localStorage.getItem('ap_key')
    if (key) setApiKey(key)
  }, [])

  const handleRegisterSuccess = (key: string) => {
    localStorage.setItem('ap_key', key)
    setApiKey(key)
    setTab('terminal')
  }

  if (!showApp) return <Landing onLaunch={() => setShowApp(true)} />

  // Force registration if connected but no key, and accessing protected tabs
  const needsRegistration = isConnected && !apiKey && (tab === 'terminal' || tab === 'dashboard' || tab === 'policy')

  return (
    <div className={`app-shell ${isCollapsed ? 'collapsed' : ''}`}>
      <Sidebar 
        activeTab={tab} 
        onTabChange={setTab} 
        isCollapsed={isCollapsed} 
        onToggle={() => setIsCollapsed(!isCollapsed)} 
      />
      <div className="main-content">
        <TopBar />
        <div style={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
          {needsRegistration ? (
            <Register onSuccess={handleRegisterSuccess} />
          ) : (
            <>
              {tab === 'terminal'  && <Terminal apiKey={apiKey} />}
              {tab === 'dashboard' && <Dashboard onNavigate={setTab} apiKey={apiKey} />}
              {tab === 'policy'    && <Policy />}
              {tab === 'agents'    && <Agents />}
              {tab === 'ledger'    && <Ledger apiKey={apiKey} />}
              {tab === 'register'  && <Register onSuccess={handleRegisterSuccess} />}
            </>
          )}
        </div>
      </div>
    </div>
  )
}

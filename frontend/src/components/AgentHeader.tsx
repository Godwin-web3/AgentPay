import { useEffect, useState } from 'react'
import { getHealth } from '../api'
import type { HealthData } from '../types'
import WalletConnect from './WalletConnect'

interface Props {
  onAddressChange: (addr: string) => void
  onBalanceChange?: (vault: string, wallet: string) => void
  onProviderChange?: (provider: any) => void
  currentView: string
  onNavigate: (view: string) => void
  onClearMemory?: () => void
  refreshTrigger?: any
}

export default function AgentHeader({ onAddressChange, onBalanceChange, onProviderChange, currentView, onNavigate, onClearMemory, refreshTrigger }: Props) {
  const [health, setHealth] = useState<HealthData | null>(null)
  const [drawerOpen, setDrawerOpen] = useState(false)

  useEffect(() => {
    getHealth().then(setHealth).catch(() => setHealth(null))
  }, [])

  const navigate = (view: string) => {
    onNavigate(view)
    setDrawerOpen(false)
  }

  return (
    <>
      <div className="agent-header">
        <div className="agent-info">
          <svg width="36" height="36" viewBox="0 0 100 100" fill="none" xmlns="http://www.w3.org/2000/svg">
            <circle cx="50" cy="50" r="44" stroke="#4fdbc8" strokeWidth="4" strokeLinecap="round" strokeDasharray="60 20 60 20 60 20 60 20" />
            <circle cx="50" cy="6" r="5" fill="#4fdbc8" />
            <circle cx="50" cy="94" r="5" fill="#4fdbc8" />
            <circle cx="6" cy="50" r="5" fill="#4fdbc8" />
            <circle cx="94" cy="50" r="5" fill="#4fdbc8" />
            <circle cx="50" cy="16" r="2.5" fill="#4fdbc8" />
            <circle cx="50" cy="84" r="2.5" fill="#4fdbc8" />
            <circle cx="16" cy="50" r="2.5" fill="#4fdbc8" />
            <circle cx="84" cy="50" r="2.5" fill="#4fdbc8" />
            <rect x="22" y="36" width="56" height="28" rx="4" fill="#4fdbc8" />
            <rect x="22" y="41" width="56" height="7" fill="#3ab8a8" />
            <rect x="28" y="53" width="12" height="7" rx="2" fill="#3ab8a8" />
            <rect x="60" y="55" width="13" height="5" rx="2.5" fill="#3ab8a8" />
          </svg>
          <div className="agent-name">AGENTPAY</div>
        </div>
        <button className="hamburger-btn" onClick={() => setDrawerOpen(true)}>
          <span /><span /><span />
        </button>
      </div>

      {drawerOpen && (
        <div className="drawer-overlay" onClick={() => setDrawerOpen(false)} />
      )}

      <div className={`drawer ${drawerOpen ? 'drawer-open' : ''}`}>
        <div className="drawer-header">
          <span className="drawer-title">MENU</span>
          <button className="drawer-close" onClick={() => setDrawerOpen(false)}>✕</button>
        </div>

        <div className="drawer-section-label">NAVIGATE</div>
        <div className="drawer-nav">
          <div className={`drawer-nav-item ${currentView === 'terminal' ? 'active' : ''}`} onClick={() => navigate('terminal')}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="4 17 10 11 4 5"/><line x1="12" y1="19" x2="20" y2="19"/>
            </svg>
            Terminal
          </div>
          <div className={`drawer-nav-item ${currentView === 'account' ? 'active' : ''}`} onClick={() => navigate('account')}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="8" r="4"/><path d="M4 20c0-4 3.6-7 8-7s8 3 8 7"/>
            </svg>
            Account
          </div>
        </div>

        <div className="drawer-divider" />
        <div className="drawer-section-label">WALLET</div>
        <div className="drawer-wallet">
          <WalletConnect onAddressChange={onAddressChange} onBalanceChange={onBalanceChange} onProviderChange={onProviderChange} refreshTrigger={refreshTrigger} />
        </div>

        <div className="drawer-divider" />
        <div className="drawer-section-label">MEMORY</div>
        <div style={{ padding: "0 16px 12px" }}>
          <button
            className="quick-btn"
            style={{ width: "100%", color: "#ff4444", borderColor: "#ff4444" }}
            onClick={() => { onClearMemory?.(); setDrawerOpen(false) }}
          >
            CLEAR MEMORY
          </button>
        </div>
        <div className="drawer-bottom">
          <div className={`status-pill ${health?.status === 'ok' ? 'online' : 'offline'}`}>
            <div className="status-dot" />
            {health?.status === 'ok' ? 'ONLINE' : 'OFFLINE'}
          </div>
          <div style={{ fontSize: 10, color: 'var(--muted)', fontFamily: 'var(--font-mono)' }}>
            SOMNIA TESTNET
          </div>
        </div>
      </div>
    </>
  )
}

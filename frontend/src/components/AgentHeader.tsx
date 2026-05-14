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
}

export default function AgentHeader({ onAddressChange, onBalanceChange, onProviderChange, currentView, onNavigate }: Props) {
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
          <div className="agent-avatar">⚡</div>
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
          <WalletConnect onAddressChange={onAddressChange} onBalanceChange={onBalanceChange} onProviderChange={onProviderChange} />
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

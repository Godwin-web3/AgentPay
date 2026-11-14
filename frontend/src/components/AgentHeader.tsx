import { useAuth } from '../contexts/AuthContext'
import { useEffect, useState, useCallback } from 'react'
import { getHealth, getPausedState, pauseAgent, resumeAgent } from '../api'
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
  activeProvider?: any
  userAddress?: string
  tag?: string | null
}

export default function AgentHeader({ onAddressChange, onBalanceChange, onProviderChange, currentView, onNavigate, onClearMemory, refreshTrigger, userAddress, tag }: Props) {
  const [health, setHealth] = useState<HealthData | null>(null)
  const [drawerOpen, setDrawerOpen] = useState(false)
  const { logout } = useAuth()
  const [isPaused, setIsPaused] = useState(false)
  const [pauseLoading, setPauseLoading] = useState(false)

  useEffect(() => {
    getHealth().then(setHealth).catch(() => setHealth(null))
  }, [])

  const fetchPausedState = useCallback(async () => {
    if (!userAddress) return
    try {
      // userPaused is keyed to the agent (Circle) wallet address; the backend
      // resolves it so the frontend doesn't need to know that address.
      const res = await getPausedState(userAddress)
      setIsPaused(res.paused)
    } catch {}
  }, [userAddress])

  useEffect(() => {
    fetchPausedState()
  }, [fetchPausedState, refreshTrigger])

  async function handleTogglePause() {
    if (!userAddress || pauseLoading) return
    setPauseLoading(true)
    try {
      if (isPaused) {
        await resumeAgent(userAddress)
      } else {
        await pauseAgent(userAddress)
      }
      setIsPaused(!isPaused)
    } catch (err: any) {
      console.error('Pause toggle failed', err?.message || err)
    } finally {
      setPauseLoading(false)
    }
  }

  const navigate = (view: string) => {
    onNavigate(view)
    setDrawerOpen(false)
  }

  return (
    <>
      <div className="agent-header">
        <div className="agent-info">
          <div className="agent-name">AgentPay</div>
          {tag && tag !== 'skip' && (
            <div style={{
              display: 'flex',
              alignItems: 'center',
              gap: 5,
              fontFamily: 'var(--font-mono)',
              fontSize: 13,
              fontWeight: 400,
              letterSpacing: 0,
              color: 'var(--muted)',
            }}>
              @{tag}
            </div>
          )}
          {userAddress && isPaused && (
            <div style={{
              padding: '2px 8px',
              borderRadius: 3,
              fontFamily: 'var(--font-mono)',
              fontSize: 9,
              fontWeight: 700,
              letterSpacing: 1.5,
              background: 'var(--danger-a1)',
              border: '1px solid var(--danger-a2)',
              color: 'var(--danger)',
            }}>
              PAUSED
            </div>
          )}
        </div>
        <button className="hamburger-btn" onClick={() => setDrawerOpen(true)}>Menu</button>
      </div>

      {drawerOpen && (
        <div className="drawer-overlay" onClick={() => setDrawerOpen(false)} />
      )}

      <div className={`drawer ${drawerOpen ? 'drawer-open' : ''}`}>
        <div className="drawer-header">
          <span className="drawer-title">Menu</span>
          <button className="drawer-close" onClick={() => setDrawerOpen(false)}>✕</button>
        </div>

        <div className="drawer-section-label">Go to</div>
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
          <div className={`drawer-nav-item ${currentView === 'history' ? 'active' : ''}`} onClick={() => navigate('history')}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"/>
            </svg>
            History
          </div>
        </div>

        <div className="drawer-divider" />
        <div className="drawer-section-label">Wallet</div>
        <div className="drawer-wallet">
          <WalletConnect onAddressChange={onAddressChange} onBalanceChange={onBalanceChange} onProviderChange={onProviderChange} refreshTrigger={refreshTrigger} />
        </div>

        <div className="drawer-divider" />
        <div className="drawer-section-label">Chat</div>
        <div style={{ padding: "0 16px 12px" }}>
          <button
            className="quick-btn"
            style={{ width: "100%", color: 'var(--danger)', borderColor: 'var(--danger)' }}
            onClick={() => { onClearMemory?.(); setDrawerOpen(false) }}
          >
            Clear chat
          </button>
        </div>
        <div className="drawer-divider" />
        <div className="drawer-section-label">Account</div>
        <div style={{ padding: "0 16px 12px" }}>
          <button
            className="quick-btn"
            style={{ width: "100%", color: 'var(--danger)', borderColor: 'var(--danger)' }}
            onClick={() => { logout(); setDrawerOpen(false); }}
          >
            Sign out
          </button>
        </div>

        <div className="drawer-bottom">
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <div className={`status-pill ${health?.status === 'ok' ? 'online' : 'offline'}`}>
              <div className="status-dot" />
              {health?.status === 'ok' ? 'Live' : 'Down'}
            </div>
            {userAddress && (
              <button
                onClick={handleTogglePause}
                disabled={pauseLoading}
                style={{
                  padding: '4px 10px',
                  borderRadius: 4,
                  fontFamily: 'var(--font-mono)',
                  fontSize: 10,
                  fontWeight: 700,
                  letterSpacing: 1,
                  cursor: pauseLoading ? 'not-allowed' : 'pointer',
                  border: '1px solid',
                  borderColor: isPaused ? 'var(--danger-a2)' : 'var(--cyan-a2)',
                  background: isPaused ? 'var(--danger-a1)' : 'var(--cyan-a1)',
                  color: isPaused ? 'var(--danger)' : 'var(--cyan)',
                  opacity: pauseLoading ? 0.5 : 1,
                  whiteSpace: 'nowrap',
                }}
              >
                {pauseLoading ? '...' : isPaused ? 'RESUME' : 'PAUSE'}
              </button>
            )}
          </div>
          <div style={{ fontSize: 10, color: 'var(--muted)', fontFamily: 'var(--font-mono)' }}>
            ARC TESTNET
          </div>
        </div>
      </div>
    </>
  )
}

import { useAuth } from '../contexts/AuthContext'
import { Wordmark } from './Mark'
import { useEffect, useState, useCallback } from 'react'
import { getHealth, getPausedState, pauseAgent, resumeAgent } from '../api'
import type { HealthData } from '../types'

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

export default function AgentHeader({ currentView, onNavigate, onClearMemory, refreshTrigger, userAddress, tag }: Props) {
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

  const labels: Record<string, string> = {
    terminal: 'Terminal',
    account: 'Account',
    history: 'History',
    policy: 'Limits',
    goals: 'Goals',
    pools: 'Pools',
    requests: 'Requests',
  }

  return (
    <>
      <div className="agent-header">
        <div className="agent-info">
          <span className="header-mark"><Wordmark size={16} /></span>
          <span className="view-label">{labels[currentView] || 'AgentPay'}</span>
          {tag && tag !== 'skip' && <span className="header-tag">@{tag}</span>}
          {userAddress && isPaused && <span className="pause-flag">Paused</span>}
        </div>
        <div className="header-actions">
          {userAddress && (
            <button
              type="button"
              className="text-link header-pause"
              onClick={handleTogglePause}
              disabled={pauseLoading}
            >
              {pauseLoading ? 'Working' : isPaused ? 'Resume' : 'Pause'}
            </button>
          )}
          <button type="button" className="hamburger-btn" onClick={() => setDrawerOpen(true)}>Menu</button>
        </div>
      </div>

      {drawerOpen && (
        <div className="drawer-overlay" onClick={() => setDrawerOpen(false)} />
      )}

      <div className={`drawer ${drawerOpen ? 'drawer-open' : ''}`}>
        <div className="drawer-header">
          <span className="drawer-title">Menu</span>
          <button type="button" className="text-link" onClick={() => setDrawerOpen(false)}>Close</button>
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
        <div className="drawer-section-label">Address</div>
        <div style={{ padding: '0 16px 16px' }}>
          <button
            type="button"
            className="addr"
            onClick={() => userAddress && navigator.clipboard.writeText(userAddress).catch(() => {})}
          >
            {userAddress || 'Signing in'}
          </button>
        </div>

        <div className="drawer-section-label">Session</div>
        <div className="drawer-actions">
          <button type="button" className="text-link" onClick={() => { onClearMemory?.(); setDrawerOpen(false) }}>
            Clear chat
          </button>
          <button type="button" className="text-link" onClick={() => { logout(); setDrawerOpen(false); }}>
            Sign out
          </button>
          {userAddress && (
            <button type="button" className="text-link" onClick={handleTogglePause} disabled={pauseLoading}>
              {pauseLoading ? 'Working' : isPaused ? 'Resume agent' : 'Pause agent'}
            </button>
          )}
        </div>

        <div className="drawer-bottom">
          <div className={`status-pill ${health?.status === 'ok' ? 'online' : 'offline'}`}>
            <div className="status-dot" />
            {health?.status === 'ok' ? 'Live' : 'Down'}
          </div>
          <div className="sidebar-foot" style={{ padding: 0 }}>Three testnets</div>
        </div>
      </div>
    </>
  )
}

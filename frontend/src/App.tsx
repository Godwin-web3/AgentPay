import { useState } from 'react'
import AgentHeader from './components/AgentHeader'
import Terminal from './views/Terminal'
import Policy from './views/Policy'
import History from './views/History'
import Landing from './views/Landing'
import type { ChatMessage } from './types'

type View = 'landing' | 'terminal' | 'policy' | 'history'

const navItems = [
  { id: 'terminal', icon: '⚡', label: 'Terminal' },
  { id: 'policy',   icon: '🛡️', label: 'Policy'   },
  { id: 'history',  icon: '📋', label: 'History'  },
] as const

export default function App() {
  const [view, setView] = useState<View>('landing')
  const [collapsed, setCollapsed] = useState(false)
  const [userAddress, setUserAddress] = useState('')
  const [messages, setMessages] = useState<ChatMessage[]>([{
    role: 'assistant',
    content: 'AgentPay online. I can send payments, manage schedules, and enforce your policy. What do you need?',
    timestamp: Date.now()
  }])

  if (view === 'landing') {
    return <Landing onLaunch={() => setView('terminal')} />
  }

  return (
    <div className="app">
      <div className="sidebar" style={{
        width: collapsed ? 56 : 220,
        minWidth: collapsed ? 56 : 220,
        transition: 'width 0.25s ease, min-width 0.25s ease'
      }}>
        <div className="sidebar-logo" style={{
          padding: collapsed ? '0 0 24px' : '0 20px 24px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: collapsed ? 'center' : 'flex-start'
        }}>
          {!collapsed && (
            <div>
              <h1>AGENTPAY</h1>
              <span>SOMNIA NETWORK</span>
            </div>
          )}
          {collapsed && <span style={{ fontSize: 20 }}>⚡</span>}
        </div>

        <nav style={{ flex: 1 }}>
          {navItems.map(item => (
            <div
              key={item.id}
              className={`nav-item ${view === item.id ? 'active' : ''}`}
              onClick={() => setView(item.id as View)}
              title={collapsed ? item.label : undefined}
              style={{
                justifyContent: collapsed ? 'center' : 'flex-start',
                padding: collapsed ? '10px 0' : '10px 20px'
              }}
            >
              <span className="nav-icon">{item.icon}</span>
              {!collapsed && <span>{item.label}</span>}
            </div>
          ))}
        </nav>

        <div
          onClick={() => setCollapsed(prev => !prev)}
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: collapsed ? 'center' : 'flex-end',
            padding: collapsed ? '12px 0' : '12px 20px',
            cursor: 'pointer',
            borderTop: '1px solid var(--border)',
            color: 'var(--muted)',
            fontFamily: 'var(--font-mono)',
            fontSize: 12,
            gap: 8,
            transition: 'color 0.2s'
          }}
          onMouseEnter={e => (e.currentTarget.style.color = 'var(--blue)')}
          onMouseLeave={e => (e.currentTarget.style.color = 'var(--muted)')}
        >
          <span style={{
            fontSize: 14,
            transition: 'transform 0.25s ease',
            display: 'inline-block',
            transform: collapsed ? 'rotate(180deg)' : 'rotate(0deg)'
          }}>◀</span>
          {!collapsed && <span>COLLAPSE</span>}
        </div>
      </div>

      <div className="main">
        <AgentHeader onAddressChange={setUserAddress} />
        {view === 'terminal' && <Terminal messages={messages} setMessages={setMessages} />}
        {view === 'policy'   && <Policy userAddress={userAddress} />}
        {view === 'history'  && <History userAddress={userAddress} />}
      </div>
    </div>
  )
}

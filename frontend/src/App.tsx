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
  const [userAddress, setUserAddress] = useState('')
  const [messages, setMessages] = useState<ChatMessage[]>(() => [{
    role: 'assistant',
    content: 'AgentPay online. I can send payments, manage schedules, and enforce your policy. What do you need?',
    timestamp: Date.now()
  }])

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
              <span className="nav-icon">{item.icon}</span>
              <span>{item.label}</span>
            </div>
          ))}
        </nav>
      </aside>

      {/* Main Content Area */}
      <main className="main">
        <AgentHeader onAddressChange={setUserAddress} />
        
        <div className="view-content">
          {view === 'terminal' && <Terminal messages={messages} setMessages={setMessages} userAddress={userAddress} />}
          {view === 'policy'   && <Policy userAddress={userAddress} />}
          {view === 'history'  && <History userAddress={userAddress} />}
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
            <span className="mobile-nav-icon">{item.icon}</span>
            <span>{item.label}</span>
          </div>
        ))}
      </nav>
    </div>
  )
}

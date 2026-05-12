import { Tab } from '../App'

const NAV = [
  { id: 'terminal',  label: 'Terminal',  icon: 'terminal' },
  { id: 'dashboard', label: 'Dashboard', icon: 'dashboard' },
  { id: 'policy',    label: 'Policy',    icon: 'policy' },
  { id: 'agents',    label: 'Agents',    icon: 'group' },
  { id: 'ledger',    label: 'Ledger',    icon: 'list_alt' },
] as const

export default function Sidebar({ activeTab, onTabChange, isCollapsed, onToggle }: {
  activeTab: Tab
  onTabChange: (tab: Tab) => void
  isCollapsed: boolean
  onToggle: () => void
}) {
  const apiKey = localStorage.getItem('ap_key')

  return (
    <div className={`sidebar ${isCollapsed ? 'collapsed' : ''}`}>
      <div className="sidebar-logo">
        <div className="sidebar-logo-icon">
          <span className="material-symbols-outlined" style={{ fontSize: 16 }}>payments</span>
        </div>
        {!isCollapsed && (
          <div>
            <div className="sidebar-logo-name">AgentPay</div>
            <div className="sidebar-logo-version">Protocol v3.0</div>
          </div>
        )}
      </div>

      <nav style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 2 }}>
        {NAV.map(item => (
          <button
            key={item.id}
            onClick={() => onTabChange(item.id as Tab)}
            className={`nav-item ${activeTab === item.id ? 'active' : ''}`}
            title={isCollapsed ? item.label : ''}
          >
            <span className="material-symbols-outlined" style={{ fontSize: 18 }}>{item.icon}</span>
            {!isCollapsed && item.label}
            {item.id === 'terminal' && !isCollapsed && <span className="nav-dot" />}
            {item.id === 'terminal' && isCollapsed && <div className="nav-dot-small" />}
          </button>
        ))}

        {!apiKey && (
          <button
            onClick={() => onTabChange('register')}
            className={`nav-item ${activeTab === 'register' ? 'active' : ''}`}
            style={{ marginTop: 12, borderTop: '1px solid #262626', paddingTop: 12 }}
            title={isCollapsed ? 'Register' : ''}
          >
            <span className="material-symbols-outlined" style={{ fontSize: 18, color: '#4fdbc8' }}>add_circle</span>
            {!isCollapsed && <span style={{ color: '#4fdbc8' }}>Register Agent</span>}
          </button>
        )}
      </nav>

      <div className="sidebar-footer">
        {!isCollapsed && (
          <div className="node-status">
            <span>Node Status</span>
            <span className="node-status-dot" />
          </div>
        )}
        {!isCollapsed ? (
          <div className="node-status-box">Connected: Somnia Testnet</div>
        ) : (
          <div style={{ display: 'flex', justifyContent: 'center' }}>
            <span className="node-status-dot" />
          </div>
        )}
        
        <button className="collapse-toggle" onClick={onToggle}>
          <span className="material-symbols-outlined">
            {isCollapsed ? 'chevron_right' : 'chevron_left'}
          </span>
        </button>
      </div>
    </div>
  )
}

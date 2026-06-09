import { useState } from 'react'
import History from './History'
import Vault from './Vault'
import Policy from './Policy'

interface Props {
  userAddress: string
  vaultBalance: string
  walletBalance: string
  tokenBalances: Record<string, string>
  activeProvider: any
  onActionSuccess?: () => void
}

type SubView = null | 'vault' | 'policy' | 'history' | 'agent'

const ChevronRight = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="9 18 15 12 9 6"/>
  </svg>
)

export default function Profile({ userAddress, vaultBalance, walletBalance, tokenBalances, activeProvider, onActionSuccess }: Props) {
  const [subView, setSubView] = useState<SubView>(null)

  function shortAddr(addr: string) {
    return addr.slice(0, 6) + '...' + addr.slice(-4)
  }

  if (!userAddress) {
    return (
      <div style={{ padding: 32, textAlign: 'center', color: 'var(--muted)', fontFamily: 'var(--font-mono)', fontSize: 13 }}>
        Connect your wallet to view your account.
      </div>
    )
  }

  if (subView === 'vault') {
    return <Vault userAddress={userAddress} vaultBalance={vaultBalance} walletBalance={walletBalance} tokenBalances={tokenBalances} activeProvider={activeProvider} onBack={() => setSubView(null)} onActionSuccess={onActionSuccess} />
  }

  if (subView === 'policy') {
    return (
      <div style={{ padding: 16, maxWidth: 480, margin: '0 auto' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 24 }}>
          <button onClick={() => setSubView(null)} style={{ background: 'none', border: 'none', color: 'var(--muted)', cursor: 'pointer', fontFamily: 'var(--font-mono)', fontSize: 13 }}>Back</button>
          <span style={{ fontFamily: 'var(--font-mono)', fontSize: 13, color: 'var(--text)' }}>POLICY</span>
        </div>
        <Policy userAddress={userAddress} />
      </div>
    )
  }

  if (subView === 'history') {
    return (
      <div style={{ padding: 16, maxWidth: 480, margin: '0 auto' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 24 }}>
          <button onClick={() => setSubView(null)} style={{ background: 'none', border: 'none', color: 'var(--muted)', cursor: 'pointer', fontFamily: 'var(--font-mono)', fontSize: 13 }}>Back</button>
          <span style={{ fontFamily: 'var(--font-mono)', fontSize: 13, color: 'var(--text)' }}>HISTORY</span>
        </div>
        <History userAddress={userAddress} />
      </div>
    )
  }

  if (subView === 'agent') {
    return (
      <div style={{ padding: 16, maxWidth: 480, margin: '0 auto' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 24 }}>
          <button onClick={() => setSubView(null)} style={{ background: 'none', border: 'none', color: 'var(--muted)', cursor: 'pointer', fontFamily: 'var(--font-mono)', fontSize: 13 }}>Back</button>
          <span style={{ fontFamily: 'var(--font-mono)', fontSize: 13, color: 'var(--text)' }}>AGENT</span>
        </div>
        <div className="card" style={{ marginBottom: 12 }}>
          <div style={{ fontSize: 10, color: 'var(--muted)', marginBottom: 4 }}>AGENT ID</div>
          <div style={{ fontFamily: 'var(--font-mono)', color: 'var(--cyan)', fontSize: 18, fontWeight: 'bold' }}>14</div>
        </div>
        <div className="card" style={{ marginBottom: 12 }}>
          <div style={{ fontSize: 10, color: 'var(--muted)', marginBottom: 4 }}>WALLET</div>
          <div style={{ fontFamily: 'var(--font-mono)', color: 'var(--text)', fontSize: 13, wordBreak: 'break-all' }}>{userAddress}</div>
        </div>
        <div className="card">
          <div style={{ fontSize: 10, color: 'var(--muted)', marginBottom: 4 }}>NETWORK</div>
          <div style={{ fontFamily: 'var(--font-mono)', color: 'var(--cyan)', fontSize: 13 }}>Somnia Testnet | Chain ID 50312</div>
        </div>
      </div>
    )
  }

  const menuItems = [
    { id: 'vault',   label: 'Vault',   desc: vaultBalance + ' STT in vault' },
    { id: 'policy',  label: 'Policy',  desc: 'Spending rules and caps' },
    { id: 'history', label: 'History', desc: 'Transaction log' },
    { id: 'agent',   label: 'Agent',   desc: 'Agent ID 14 | Somnia Testnet' },
  ]

  return (
    <div style={{ padding: 16, maxWidth: 480, margin: '0 auto' }}>
      <div className="card" style={{ marginBottom: 24, padding: '12px 16px' }}>
        <div style={{ fontSize: 10, color: 'var(--muted)', marginBottom: 4 }}>CONNECTED</div>
        <div style={{ fontFamily: 'var(--font-mono)', color: 'var(--cyan)', fontSize: 14 }}>{shortAddr(userAddress)}</div>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
        {menuItems.map(item => (
          <button
            key={item.id}
            onClick={() => setSubView(item.id as SubView)}
            style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '16px', background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 4, cursor: 'pointer', textAlign: 'left', width: '100%' }}
          >
            <div>
              <div style={{ fontFamily: 'var(--font-mono)', color: 'var(--text)', fontSize: 13, marginBottom: 2 }}>{item.label}</div>
              <div style={{ fontFamily: 'var(--font-mono)', color: 'var(--muted)', fontSize: 11 }}>{item.desc}</div>
            </div>
            <span style={{ color: 'var(--muted)' }}><ChevronRight /></span>
          </button>
        ))}
      </div>
    </div>
  )
}

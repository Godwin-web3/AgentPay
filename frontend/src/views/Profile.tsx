import { useState } from 'react'
import History from './History'
import Vault from './Vault'
import Policy from './Policy'

interface Props {
  userAddress: string
  tag?: string | null
  vaultBalance: string
  walletBalance: string
  tokenBalances: Record<string, string>
  activeProvider: any
  onActionSuccess?: () => void
  agentWalletAddress?: string
  agentWalletBalance?: string
  userId: string
}

type SubView = null | 'vault' | 'policy' | 'history' | 'agent'

const ChevronRight = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="9 18 15 12 9 6"/>
  </svg>
)

export default function Profile({ userAddress, userId, vaultBalance, walletBalance, tokenBalances, activeProvider, onActionSuccess, agentWalletAddress, agentWalletBalance, tag }: Props) {
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
        <Policy userAddress={userAddress} userId={userId} />
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
        <History userAddress={userAddress} userId={userId} />
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
        <div className="card" style={{ marginBottom: 12, padding: '16px' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
            <span style={{ fontSize: 10, color: 'var(--muted)', letterSpacing: '0.05em' }}>YOUR WALLET</span>
            <span style={{ fontSize: 9, color: 'var(--cyan)', border: '1px solid var(--cyan)', borderRadius: 3, padding: '1px 6px' }}>CIRCLE</span>
          </div>
          <div style={{ fontFamily: 'var(--font-mono)', color: 'var(--text)', fontSize: 13, wordBreak: 'break-all' }}>{userAddress}</div>
        </div>
        <div className="card" style={{ marginBottom: 12, padding: '16px' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
            <span style={{ fontSize: 10, color: 'var(--muted)', letterSpacing: '0.05em' }}>YOUR VAULT</span>
            <span style={{ fontSize: 9, color: 'var(--muted)', border: '1px solid var(--border)', borderRadius: 3, padding: '1px 6px' }}>VAULT</span>
          </div>
          <div style={{ fontFamily: 'var(--font-mono)', color: 'var(--text)', fontSize: 13, wordBreak: 'break-all' }}>{agentWalletAddress || '—'}</div>
          <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 8, borderTop: '1px solid var(--border)', paddingTop: 8 }}>
            Balance: <span style={{ color: 'var(--text)' }}>{agentWalletBalance || '0'} USDC</span>
          </div>
        </div>
        <div className="card" style={{ padding: '16px' }}>
          <div style={{ fontSize: 10, color: 'var(--muted)', marginBottom: 8, letterSpacing: '0.05em' }}>NETWORK</div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <span style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--cyan)', display: 'inline-block' }} />
            <span style={{ fontFamily: 'var(--font-mono)', color: 'var(--cyan)', fontSize: 13 }}>Arc Testnet</span>
            <span style={{ color: 'var(--muted)', fontSize: 12 }}>· Chain ID 5042002</span>
          </div>
        </div>
      </div>
    )
  }

  const menuItems = [
    { id: 'vault',   label: 'Vault',   desc: vaultBalance + ' USDC in vault' },
    { id: 'policy',  label: 'Policy',  desc: 'Spending rules and caps' },
    { id: 'history', label: 'History', desc: 'Transaction log' },
    { id: 'agent',   label: 'Agent',   desc: 'Agent wallet & network' },
  ]

  return (
    <div style={{ padding: 16, maxWidth: 480, margin: '0 auto' }}>
      <div className="card" style={{ marginBottom: 24, padding: '12px 16px' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div>
            <div style={{ fontSize: 10, color: 'var(--muted)', marginBottom: 4 }}>CONNECTED</div>
            <div style={{ fontFamily: 'var(--font-mono)', color: 'var(--cyan)', fontSize: 14 }}>{shortAddr(userAddress)}</div>
          </div>
          {tag && tag !== 'skip' && (
            <div style={{ fontFamily: 'var(--font-mono)', color: 'var(--text)', fontSize: 14, background: 'var(--bg)', border: '1px solid var(--cyan)', borderRadius: 4, padding: '4px 10px' }}>
              @{tag}
            </div>
          )}
        </div>
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

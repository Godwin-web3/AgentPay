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

type SubView = null | 'vault' | 'policy' | 'history'

const ChevronRight = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="9 18 15 12 9 6"/>
  </svg>
)

export default function Profile({ userAddress, userId, vaultBalance, walletBalance, tokenBalances, activeProvider, onActionSuccess, agentWalletAddress, tag }: Props) {
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

  return (
    <div style={{ padding: 16, maxWidth: 480, margin: '0 auto' }}>

      {/* Identity strip */}
      <div className="card" style={{ marginBottom: 16, padding: '12px 16px' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div>
            <div style={{ fontSize: 10, color: 'var(--muted)', marginBottom: 4 }}>CONNECTED</div>
            <div style={{ fontFamily: 'var(--font-mono)', color: 'var(--seal)', fontSize: 14 }}>{shortAddr(userAddress)}</div>
          </div>
          {tag && tag !== 'skip' && (
            <div style={{ fontFamily: 'var(--font-mono)', color: 'var(--text)', fontSize: 14, background: 'var(--bg)', border: '1px solid var(--seal)', borderRadius: 4, padding: '4px 10px' }}>
              @{tag}
            </div>
          )}
        </div>
      </div>

      {/* Vault — the primary stat, with quick actions right here */}
      <div className="card" style={{ marginBottom: 16, padding: '20px' }}>
        <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10, letterSpacing: 3, color: 'var(--muted)', marginBottom: 8 }}>
          VAULT BALANCE
        </div>
        <div style={{ fontFamily: 'var(--font-head)', fontSize: 36, fontWeight: 700, color: 'var(--text)', lineHeight: 1, marginBottom: 16 }}>
          {vaultBalance} <span style={{ fontSize: 16, color: 'var(--muted)', fontWeight: 400 }}>USDC</span>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 14 }}>
          <button
            onClick={() => setSubView('vault')}
            style={{ padding: '10px 8px', background: 'var(--seal)', border: '1px solid var(--seal)', color: '#0B0D10', fontFamily: 'var(--font-mono)', fontSize: 10, letterSpacing: 1.5, fontWeight: 700, cursor: 'pointer' }}
          >
            DEPOSIT
          </button>
          <button
            onClick={() => setSubView('vault')}
            style={{ padding: '10px 8px', background: 'transparent', border: '1px solid var(--border)', color: 'var(--muted)', fontFamily: 'var(--font-mono)', fontSize: 10, letterSpacing: 1.5, cursor: 'pointer' }}
          >
            WITHDRAW
          </button>
        </div>
        <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--muted)', wordBreak: 'break-all', paddingTop: 10, borderTop: '1px solid var(--border)' }}>
          {agentWalletAddress || '—'}
        </div>
      </div>

      {/* Wallet — secondary stat */}
      <div className="card" style={{ marginBottom: 16, padding: '16px' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
          <span style={{ fontSize: 10, color: 'var(--muted)', letterSpacing: '0.05em' }}>YOUR WALLET</span>
          <span style={{ fontSize: 9, color: 'var(--wire)', border: '1px solid var(--wire)', borderRadius: 3, padding: '1px 6px' }}>CIRCLE</span>
        </div>
        <div style={{ fontFamily: 'var(--font-mono)', color: 'var(--text)', fontSize: 13, wordBreak: 'break-all', marginBottom: 8 }}>{userAddress}</div>
        <div style={{ fontSize: 11, color: 'var(--muted)', borderTop: '1px solid var(--border)', paddingTop: 8 }}>
          Balance: <span style={{ color: 'var(--text)' }}>{walletBalance || '0'} USDC</span>
        </div>
      </div>

      {/* Network */}
      <div className="card" style={{ marginBottom: 16, padding: '14px 16px' }}>
        <div style={{ fontSize: 10, color: 'var(--muted)', marginBottom: 8, letterSpacing: '0.05em' }}>NETWORK</div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <span style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--seal)', display: 'inline-block' }} />
          <span style={{ fontFamily: 'var(--font-mono)', color: 'var(--seal)', fontSize: 13 }}>Arc Testnet</span>
          <span style={{ color: 'var(--muted)', fontSize: 12 }}>· Chain ID 5042002</span>
        </div>
      </div>

      {/* Policy — the one menu item that's genuinely unique to Account */}
      <button
        onClick={() => setSubView('policy')}
        style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '16px', background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 4, cursor: 'pointer', textAlign: 'left', width: '100%' }}
      >
        <div>
          <div style={{ fontFamily: 'var(--font-mono)', color: 'var(--text)', fontSize: 13, marginBottom: 2 }}>Policy</div>
          <div style={{ fontFamily: 'var(--font-mono)', color: 'var(--muted)', fontSize: 11 }}>Spending rules and caps</div>
        </div>
        <span style={{ color: 'var(--muted)' }}><ChevronRight /></span>
      </button>
    </div>
  )
}

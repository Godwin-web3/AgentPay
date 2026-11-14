import { useState } from 'react'
import History from './History'
import Vault from './Vault'
import Policy from './Policy'

interface Props {
  userAddress: string
  tag?: string | null
  vaultBalance: string
  positions?: { label: string; amount: string }[]
  stocks?: { symbol: string; amount: string }[]
  walletBalance: string
  tokenBalances: Record<string, string>
  activeProvider: any
  onActionSuccess?: () => void
  agentWalletAddress?: string
  agentWalletBalance?: string
  userId: string
}

type SubView = null | 'vault' | 'policy' | 'history'

export default function Profile({ userAddress, userId, vaultBalance, positions = [], stocks = [], walletBalance, tokenBalances, activeProvider, onActionSuccess, agentWalletAddress, tag }: Props) {
  const [subView, setSubView] = useState<SubView>(null)

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

  const address = agentWalletAddress || userAddress

  return (
    <div className="reveal" style={{ padding: '8px 16px 32px', maxWidth: 560, margin: '0 auto' }}>
      <p className="kicker">{tag && tag !== 'skip' ? `@${tag}` : 'Account'}</p>
      <h2 className="page-title" style={{ fontSize: 'clamp(40px, 10vw, 56px)', marginBottom: 8 }}>Holdings</h2>
      <p className="lede" style={{ marginTop: 0 }}>One address. Robinhood, Base, and Arc.</p>

      <button
        type="button"
        className="addr"
        onClick={() => navigator.clipboard.writeText(address).catch(() => {})}
        aria-label="Copy address"
      >
        {address}
      </button>

      <div style={{ marginTop: 22, borderTop: '1px solid #161513' }}>
        {(positions.length ? positions : [{ label: 'Nothing claimed yet', amount: '—' }]).map((row) => (
          <div key={row.label} className="hold-row">
            <span>{row.label}</span>
            <span>{row.amount}</span>
          </div>
        ))}
      </div>

      {stocks.length > 0 && (
        <div style={{ marginTop: 28 }}>
          <p className="kicker">Robinhood stocks</p>
          <div style={{ borderTop: '1px solid var(--border)' }}>
            {stocks.map((token) => (
              <div key={token.symbol} className="hold-row">
                <span>{token.symbol}</span>
                <span>{token.amount}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      <div style={{ display: 'flex', gap: 22, marginTop: 22 }}>
        <button type="button" onClick={() => setSubView('vault')} className="text-link">Deposit</button>
        <button type="button" onClick={() => setSubView('vault')} className="text-link">Withdraw</button>
      </div>

      <button
        type="button"
        onClick={() => setSubView('policy')}
        className="text-link"
        style={{ marginTop: 8, fontFamily: 'var(--font-head)', fontSize: 18 }}
      >
        Spending limits
      </button>
    </div>
  )
}

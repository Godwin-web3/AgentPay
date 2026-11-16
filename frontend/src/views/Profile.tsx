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
      <div style={{ padding: 32, textAlign: 'center', color: 'var(--muted)', fontSize: 15 }}>
        Connect your wallet to view your account.
      </div>
    )
  }

  if (subView === 'vault') {
    return <Vault userAddress={userAddress} vaultBalance={vaultBalance} walletBalance={walletBalance} tokenBalances={tokenBalances} activeProvider={activeProvider} onBack={() => setSubView(null)} onActionSuccess={onActionSuccess} />
  }

  if (subView === 'policy') {
    return (
      <div className="desk">
        <button type="button" onClick={() => setSubView(null)} className="back-link">Back</button>
        <Policy userAddress={userAddress} userId={userId} />
      </div>
    )
  }

  if (subView === 'history') {
    return (
      <div className="desk">
        <button type="button" onClick={() => setSubView(null)} className="back-link">Back</button>
        <History userAddress={userAddress} userId={userId} />
      </div>
    )
  }

  const address = agentWalletAddress || userAddress

  return (
    <div className="desk reveal">
      <p className="kicker">{tag && tag !== 'skip' ? `@${tag}` : 'Account'}</p>
      <h2 className="page-title">Holdings</h2>
      <p className="lede desk-lede">One address across Robinhood, Base, and Arc.</p>

      <button
        type="button"
        className="addr"
        onClick={() => navigator.clipboard.writeText(address).catch(() => {})}
        aria-label="Copy address"
      >
        {address}
      </button>

      <div className="ledger">
        {(positions.length ? positions : [{ label: 'Nothing claimed yet', amount: '—' }]).map((row) => (
          <div key={row.label} className="hold-row">
            <span>{row.label}</span>
            <span>{row.amount}</span>
          </div>
        ))}
      </div>

      {stocks.length > 0 && (
        <div className="ledger-block">
          <p className="kicker">Robinhood stocks</p>
          <div className="ledger">
            {stocks.map((token) => (
              <div key={token.symbol} className="hold-row">
                <span>{token.symbol}</span>
                <span>{token.amount}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="desk-actions">
        <button type="button" onClick={() => setSubView('vault')} className="ink-btn">Deposit or withdraw</button>
        <button type="button" onClick={() => setSubView('policy')} className="text-link">Spending limits</button>
      </div>
    </div>
  )
}

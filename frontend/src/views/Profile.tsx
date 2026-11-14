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

  return (
    <div className="reveal" style={{ padding: 16, maxWidth: 480, margin: '0 auto' }}>
      <p className="eyebrow">{tag && tag !== 'skip' ? `@${tag}` : 'Account'}</p>
      <div className="money" style={{ margin: '10px 0 8px' }}>
        {vaultBalance}
      </div>
      <div style={{ color: 'var(--muted)', marginBottom: 20 }}>Balance</div>

      <div style={{ borderTop: '1px solid var(--border)' }}>
        {(positions.length ? positions : [{ label: 'Vault', amount: vaultBalance }]).map((row) => (
          <div key={row.label} style={{ display: 'flex', justifyContent: 'space-between', gap: 16, padding: '12px 0', borderBottom: '1px solid var(--border)', fontSize: 14 }}>
            <span style={{ color: 'var(--muted)' }}>{row.label}</span>
            <span style={{ fontVariantNumeric: 'tabular-nums' }}>{row.amount}</span>
          </div>
        ))}
        {walletBalance && !positions.some((row) => row.label === 'Arc wallet') && (
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 16, padding: '12px 0', borderBottom: '1px solid var(--border)', fontSize: 14 }}>
            <span style={{ color: 'var(--muted)' }}>Arc wallet</span>
            <span style={{ fontVariantNumeric: 'tabular-nums' }}>{walletBalance}</span>
          </div>
        )}
      </div>

      {stocks.length > 0 && (
        <div style={{ marginTop: 28 }}>
          <p className="eyebrow">Robinhood testnet</p>
          {stocks.map((token) => (
            <div key={token.symbol} style={{ display: 'flex', justifyContent: 'space-between', gap: 16, padding: '12px 0', borderBottom: '1px solid var(--border)', fontSize: 14 }}>
              <span style={{ color: 'var(--muted)' }}>{token.symbol}</span>
              <span style={{ fontVariantNumeric: 'tabular-nums' }}>{token.amount}</span>
            </div>
          ))}
        </div>
      )}

      <div style={{ display: 'flex', gap: 16, margin: '16px 0 24px' }}>
        <button onClick={() => setSubView('vault')} style={{ background: 'none', border: 'none', padding: 0, color: 'var(--text)', cursor: 'pointer', font: 'inherit' }}>Deposit</button>
        <button onClick={() => setSubView('vault')} style={{ background: 'none', border: 'none', padding: 0, color: 'var(--muted)', cursor: 'pointer', font: 'inherit' }}>Withdraw</button>
      </div>

      <div style={{ fontFamily: 'var(--font-body)', fontSize: 13, color: 'var(--muted)', marginTop: 22 }}>
        {(agentWalletAddress || userAddress).slice(0, 6)}…{(agentWalletAddress || userAddress).slice(-4)}
      </div>

      <button
        onClick={() => setSubView('policy')}
        style={{ display: 'block', marginTop: 18, padding: 0, background: 'none', border: 'none', cursor: 'pointer', textAlign: 'left', color: 'var(--text)', font: 'inherit', fontSize: 16 }}
      >
        Spending limits
      </button>
    </div>
  )
}

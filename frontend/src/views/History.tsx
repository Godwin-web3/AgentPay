import { useEffect, useState } from 'react'
import { getHistory } from '../api'

function formatTime(ts: number | string) {
  const d = new Date(ts)
  const month = d.toLocaleString([], { month: 'short' })
  const day = d.getDate()
  const time = d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
  return `${month} ${day}, ${time}`
}

function shortAddr(addr?: string) {
  if (!addr) return ''
  return addr.slice(0, 6) + '...' + addr.slice(-4)
}

function describeEntry(tx: any) {
  const amount = tx.amount != null ? `${tx.amount} ${tx.token || 'USDC'}` : null

  if (tx.failed || tx.status === 'blocked') {
    return {
      title: 'Blocked',
      sub: tx.blockedReason || 'Policy violation',
      amount,
      tone: 'danger' as const
    }
  }

  switch (tx.type) {
    case 'schedule':
      return { title: 'Scheduled payment', sub: `to ${shortAddr(tx.to)}`, amount, tone: 'seal' as const }
    case 'payment':
      return { title: 'Sent', sub: `to ${shortAddr(tx.to)}`, amount, tone: 'seal' as const }
    case 'deposit':
      return { title: 'Deposited', sub: 'into vault', amount, tone: 'seal' as const }
    case 'withdrawal':
      return { title: 'Withdrew', sub: 'from vault', amount, tone: 'wire' as const }
    case 'job_hire':
      return { title: 'Hired agent', sub: tx.reason || `to ${shortAddr(tx.to)}`, amount, tone: 'wire' as const }
    case 'job_fulfilled':
      return { title: 'Job fulfilled', sub: tx.reason || 'Deliverable submitted', amount, tone: 'seal' as const }
    case 'swap':
      return { title: 'Swapped', sub: `${tx.fromToken || ''} → ${tx.toToken || ''}`, amount, tone: 'wire' as const }
    case 'pool_contribute':
      return { title: 'Contributed to pool', sub: tx.reason || '', amount, tone: 'seal' as const }
    case 'pool_withdraw_personal':
      return { title: 'Withdrew personal allowance', sub: 'from pool', amount, tone: 'wire' as const }
    case 'pool_spend':
      return { title: 'Pool spend', sub: tx.reason || `to ${shortAddr(tx.to)}`, amount, tone: 'seal' as const }
    default:
      if (tx.amount && tx.to) {
        return { title: 'Sent', sub: `to ${shortAddr(tx.to)}`, amount, tone: 'seal' as const }
      }
      return { title: tx.label || 'Activity', sub: '', amount, tone: 'muted' as const }
  }
}

const toneColor: Record<string, string> = {
  seal: 'var(--seal)',
  wire: 'var(--wire)',
  danger: 'var(--danger)',
  muted: 'var(--muted)'
}

export default function History({ userAddress, userId, refreshTrigger = 0 }: { userAddress: string, userId: string, refreshTrigger?: number }) {
  const [txs, setTxs] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    if (!userAddress) return
    setLoading(true)
    setError('')
    getHistory(userId)
      .then(res => {
        const items = res.items || []
        const financial = items.filter((tx: any) => tx.type !== 'inference' && tx.type !== 'chat')
        setTxs(financial)
      })
      .catch(() => setError('Failed to load history'))
      .finally(() => setLoading(false))
  }, [userAddress, refreshTrigger])

  if (loading) return (
    <div className="history-view">
      <div className="empty-state">
        <div className="icon" style={{ animation: 'pulse 1.5s infinite' }}>⚡</div>
        Syncing activity...
      </div>
    </div>
  )

  if (error) return (
    <div className="history-view">
      <div className="empty-state">
        <div className="icon">⚠️</div>
        {error}
      </div>
    </div>
  )

  if (txs.length === 0) return (
    <div className="history-view">
      <div className="empty-state">
        <div className="icon">📭</div>
        No financial activity.
      </div>
    </div>
  )

  return (
    <div className="history-view" style={{ paddingBottom: 80 }}>
      <div style={{ marginBottom: 24 }}>
        <div style={{ fontSize: 10, color: 'var(--muted)', marginBottom: 6, fontFamily: 'var(--font-mono)', letterSpacing: 2 }}>FINANCIAL LOG</div>
        <div style={{ fontSize: 11, color: 'var(--seal)', fontFamily: 'var(--font-mono)', opacity: 0.8 }}>{userAddress}</div>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {txs.map((tx, i) => {
          const explorerUrl = tx.txHash ? 'https://testnet.arcscan.app/tx/' + tx.txHash : null
          const entry = describeEntry(tx)
          const color = toneColor[entry.tone]

          return (
            <div key={tx.id || i} className="card" style={{ padding: '14px 16px', margin: 0 }}>
              <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 }}>
                <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10, minWidth: 0 }}>
                  <span style={{
                    width: 8, height: 8, borderRadius: '50%', background: color,
                    marginTop: 5, flexShrink: 0,
                    boxShadow: entry.tone === 'seal' ? `0 0 6px ${color}88` : 'none'
                  }} />
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontFamily: 'var(--font-body)', fontSize: 13, fontWeight: 600, color: entry.tone === 'danger' ? color : 'var(--text)' }}>
                      {entry.title}
                    </div>
                    {entry.sub && (
                      <div style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--muted)', marginTop: 2, wordBreak: 'break-word' }}>
                        {entry.sub}
                      </div>
                    )}
                  </div>
                </div>
                {entry.amount && (
                  <div style={{ fontFamily: 'var(--font-mono)', fontSize: 13, fontWeight: 700, color, flexShrink: 0, whiteSpace: 'nowrap' }}>
                    {entry.amount}
                  </div>
                )}
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 10, paddingTop: 10, borderTop: '1px solid var(--border)' }}>
                {explorerUrl && (
                  <a href={explorerUrl} target="_blank" rel="noreferrer" style={{ color: 'var(--wire)', textDecoration: 'none', fontFamily: 'var(--font-mono)', fontSize: 10 }}>
                    Tx: {tx.txHash.slice(0, 8)}... ↗
                  </a>
                )}
                <span style={{ flex: 1 }} />
                <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--muted)' }}>
                  {formatTime(tx.timestamp)}
                </span>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

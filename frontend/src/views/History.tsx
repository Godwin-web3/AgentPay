import { useEffect, useState } from 'react'
import { getHistory } from '../api'

function shortAddr(addr?: string) {
  if (!addr) return ''
  return addr.slice(0, 6) + '...' + addr.slice(-4)
}

function dateGroupLabel(ts: number | string) {
  const d = new Date(ts)
  const today = new Date()
  const yesterday = new Date(today)
  yesterday.setDate(today.getDate() - 1)
  const sameDay = (a: Date, b: Date) => a.toDateString() === b.toDateString()
  if (sameDay(d, today)) return 'Today'
  if (sameDay(d, yesterday)) return 'Yesterday'
  return d.toLocaleDateString([], { month: 'long', day: 'numeric', year: d.getFullYear() !== today.getFullYear() ? 'numeric' : undefined })
}

function formatClock(ts: number | string) {
  return new Date(ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
}

function describeEntry(tx: any) {
  const amount = tx.amount != null ? `${tx.amount} ${tx.token || 'USDC'}` : null

  if (tx.failed || tx.status === 'blocked') {
    return { title: 'Blocked', sub: tx.blockedReason || 'Policy violation', amount, sign: null as null | '+' | '−', badge: null as string | null }
  }

  switch (tx.type) {
    case 'schedule':
      return { title: 'Scheduled payment', sub: `to ${shortAddr(tx.to)}`, amount, sign: '−' as const, badge: null }
    case 'payment':
      return { title: 'Sent', sub: `to ${shortAddr(tx.to)}`, amount, sign: '−' as const, badge: null }
    case 'deposit':
      return { title: 'Deposited', sub: 'into vault', amount, sign: '+' as const, badge: null }
    case 'withdrawal':
      return { title: 'Withdrew', sub: 'from vault', amount, sign: '+' as const, badge: null }
    case 'job_hire':
      return { title: 'Hired agent', sub: tx.reason || `to ${shortAddr(tx.to)}`, amount, sign: '−' as const, badge: null }
    case 'job_fulfilled':
      return { title: 'Job fulfilled', sub: tx.reason || 'Deliverable submitted', amount, sign: '+' as const, badge: null }
    case 'swap':
      return { title: 'Swapped', sub: `${tx.fromToken || ''} → ${tx.toToken || ''}`, amount, sign: null, badge: null }
    case 'pool_contribute':
      return { title: 'Contributed to pool', sub: tx.reason || '', amount, sign: '−' as const, badge: null }
    case 'pool_withdraw_personal':
      return { title: 'Withdrew personal allowance', sub: 'from pool', amount, sign: '+' as const, badge: null }
    case 'pool_spend':
      return { title: 'Pool spend', sub: tx.reason || `to ${shortAddr(tx.to)}`, amount, sign: '−' as const, badge: null }
    case 'x402_fetch':
      return { title: 'Paid for live data', sub: tx.reason || 'Fetched via x402', amount, sign: '−' as const, badge: 'x402' }
    default:
      if (tx.amount && tx.to) {
        return { title: 'Sent', sub: `to ${shortAddr(tx.to)}`, amount, sign: '−' as const, badge: null }
      }
      return { title: tx.label || 'Activity', sub: '', amount, sign: null, badge: null }
  }
}

function groupByDate(txs: any[]) {
  const groups: { label: string; entries: any[] }[] = []
  for (const tx of txs) {
    const label = dateGroupLabel(tx.timestamp)
    let group = groups.find(g => g.label === label)
    if (!group) { group = { label, entries: [] }; groups.push(group) }
    group.entries.push(tx)
  }
  return groups
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

  const groups = groupByDate(txs)

  return (
    <div className="history-view" style={{ paddingBottom: 80 }}>
      <div className="reveal" style={{ marginBottom: 28 }}>
        <p className="eyebrow">Every dollar, accounted for</p>
        <h2 className="page-title" style={{ marginBottom: 8 }}>The Ledger</h2>
        <div className="mono-data" style={{ fontSize: 11, color: 'var(--muted)' }}>{userAddress}</div>
      </div>

      <div className="card-deep reveal" style={{ padding: '4px 20px' }}>
        {groups.map((group, gi) => (
          <div key={group.label}>
            <div style={{
              fontFamily: 'var(--font-mono)',
              fontSize: 10,
              letterSpacing: '0.14em',
              textTransform: 'uppercase',
              color: 'var(--muted)',
              padding: '16px 0 8px',
              borderTop: gi === 0 ? 'none' : '1px solid var(--border)',
              marginTop: gi === 0 ? 0 : 4,
            }}>
              {group.label}
            </div>

            {group.entries.map((tx, i) => {
              const explorerUrl = tx.txHash ? 'https://testnet.arcscan.app/tx/' + tx.txHash : null
              const entry = describeEntry(tx)
              const amountColor = entry.sign === null && !tx.failed && tx.status !== 'blocked'
                ? 'var(--text)'
                : (tx.failed || tx.status === 'blocked') ? 'var(--danger)' : 'var(--seal)'

              return (
                <div
                  key={tx.id || i}
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'flex-start',
                    gap: 16,
                    padding: '13px 0',
                    borderBottom: i === group.entries.length - 1 ? 'none' : '1px solid var(--border)',
                  }}
                >
                  <div style={{ minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <div style={{
                        fontFamily: 'var(--font-head)',
                        fontWeight: 500,
                        fontSize: 14,
                        color: (tx.failed || tx.status === 'blocked') ? 'var(--danger)' : 'var(--text)',
                      }}>
                        {entry.title}
                      </div>
                      {entry.badge && (
                        <span className="mono-data" style={{
                          fontSize: 9,
                          letterSpacing: '0.08em',
                          padding: '2px 6px',
                          borderRadius: 4,
                          border: '1px solid var(--wire)',
                          color: 'var(--wire)',
                          textTransform: 'uppercase',
                        }}>
                          ⚡ {entry.badge}
                        </span>
                      )}
                    </div>
                    {entry.sub && (
                      <div style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--muted)', marginTop: 3, wordBreak: 'break-word' }}>
                        {entry.sub}
                      </div>
                    )}
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 5 }}>
                      {explorerUrl && (
                        <a href={explorerUrl} target="_blank" rel="noreferrer" className="mono-data" style={{ color: 'var(--wire)', textDecoration: 'none', fontSize: 10 }}>
                          {tx.txHash.slice(0, 8)}... ↗
                        </a>
                      )}
                    </div>
                  </div>

                  <div style={{ textAlign: 'right', flexShrink: 0 }}>
                    {entry.amount && (
                      <div className="mono-data" style={{ fontSize: 14, fontWeight: 700, color: amountColor }}>
                        {entry.sign || ''}{entry.amount}
                      </div>
                    )}
                    <div className="mono-data" style={{ fontSize: 10, color: 'var(--muted)', marginTop: 5 }}>
                      {formatClock(tx.timestamp)}
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        ))}
      </div>
    </div>
  )
}

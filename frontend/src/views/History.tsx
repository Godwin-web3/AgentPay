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
      return { title: 'Deposit', sub: tx.chain === 'base' || String(tx.reason || '').includes('Base') ? 'Base Sepolia vault' : (tx.reason || 'Vault'), amount, sign: '+' as const, badge: null }
    case 'withdrawal':
      return { title: 'Withdrew', sub: 'from vault', amount, sign: '+' as const, badge: null }
    case 'job_hire':
      return { title: 'Hired agent', sub: tx.reason || `to ${shortAddr(tx.to)}`, amount, sign: '−' as const, badge: null }
    case 'job_fulfilled':
      return { title: 'Job fulfilled', sub: tx.reason || 'Deliverable submitted', amount, sign: '+' as const, badge: null }
    case 'swap':
      return { title: 'Swapped', sub: `${tx.fromToken || ''} → ${tx.toToken || ''}`, amount, sign: null, badge: null }
    case 'bridge':
      return { title: 'Bridge', sub: tx.reason || 'USDC', amount, sign: '−' as const, badge: null }
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
      <div className="empty-state">Loading activity.</div>
    </div>
  )

  if (error) return (
    <div className="history-view">
      <div className="empty-state">Activity could not be loaded.</div>
    </div>
  )

  if (txs.length === 0) return (
    <div className="history-view">
      <p className="kicker">Activity</p>
      <h2 className="page-title">Nothing yet</h2>
      <p className="lede desk-lede">Sends, deposits, and swaps will settle here.</p>
    </div>
  )

  const groups = groupByDate(txs)

  return (
    <div className="history-view">
      <div className="desk-head reveal">
        <p className="kicker">Activity</p>
        <h2 className="page-title">History</h2>
      </div>

      {groups.map((group) => (
        <section key={group.label} className="ledger-block">
          <div className="day-label">{group.label}</div>
          <div className="ledger">
            {group.entries.map((tx, i) => {
              const explorerUrl = tx.txHash ? 'https://testnet.arcscan.app/tx/' + tx.txHash : null
              const entry = describeEntry(tx)
              const failed = tx.failed || tx.status === 'blocked'
              return (
                <div key={tx.id || i} className="hold-row ledger-row">
                  <div className="ledger-main">
                    <div className={failed ? 'ledger-title is-danger' : 'ledger-title'}>
                      {entry.title}
                      {entry.badge ? <span className="ledger-badge">{entry.badge}</span> : null}
                    </div>
                    {entry.sub && <div className="ledger-sub">{entry.sub}</div>}
                    {explorerUrl && (
                      <a href={explorerUrl} target="_blank" rel="noreferrer" className="ledger-link">
                        {tx.txHash.slice(0, 10)}
                      </a>
                    )}
                  </div>
                  <div className="ledger-amt">
                    {entry.amount && (
                      <div className={failed ? 'is-danger' : undefined}>
                        {entry.sign || ''}{entry.amount}
                      </div>
                    )}
                    <div className="ledger-time">{formatClock(tx.timestamp)}</div>
                  </div>
                </div>
              )
            })}
          </div>
        </section>
      ))}
    </div>
  )
}

import { useEffect, useState } from 'react'
import { getHistory } from '../api'

function formatTime(ts: number | string) {
  const d = new Date(ts)
  const month = d.toLocaleString([], { month: 'short' })
  const day = d.getDate()
  const time = d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
  return `${month} ${day}, ${time}`
}

function formatDayOnly(ts: number | string) {
  const d = new Date(ts)
  return d.toLocaleString([], { month: 'short', day: 'numeric' })
}

export default function History({ userAddress, refreshTrigger = 0 }: { userAddress: string, refreshTrigger?: number }) {
  const [txs, setTxs] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    if (!userAddress) return
    setLoading(true)
    setError('')
    getHistory(userAddress)
      .then(res => {
        const items = res.items || []
        // Filter out non-financial items (like pure inferences/chat)
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
        <div style={{ fontSize: 11, color: 'var(--cyan)', fontFamily: 'var(--font-mono)', opacity: 0.8 }}>{userAddress}</div>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
        {txs.map((tx, i) => {
          const explorerUrl = tx.txHash ? 'https://shannon-explorer.somnia.network/tx/' + tx.txHash : null
          
          let actionLabel = tx.label || 'Activity'
          if (tx.status === 'blocked') {
             actionLabel = `Blocked: ${tx.blockedReason || 'Policy violation'}`
          } else if (tx.type === 'schedule') {
             actionLabel = `Scheduled: ${tx.label || ('Pay ' + tx.amount + ' STT to ' + (tx.to?.slice(0,6) + '...'))}`
          } else if (tx.type === 'swap') {
             // If label already contains "Swap", use it, otherwise add it
             actionLabel = tx.label?.toLowerCase().startsWith('swap') ? tx.label : `Swap ${tx.label}`
          } else if (tx.type === 'payment') {
             const to = tx.to ? ` → ${tx.to.slice(0, 6)}...` : ''
             actionLabel = `Sent ${tx.amount} ${tx.token || 'STT'}${to}`
          } else if (tx.type === 'deposit' || tx.type === 'withdrawal') {
             const verb = tx.type === 'deposit' ? 'Deposited' : 'Withdrew'
             actionLabel = `${verb} ${tx.amount} ${tx.token || 'STT'}`
          }

          return (
            <div key={tx.id || i} style={{ 
              display: 'flex',
              alignItems: 'center',
              padding: '12px 0',
              borderBottom: '1px solid var(--border)',
              fontFamily: 'var(--font-mono)',
              fontSize: 11,
              whiteSpace: 'nowrap',
              overflow: 'hidden',
              color: tx.status === 'blocked' ? '#FF3B5C' : 'var(--text)'
            }}>
              <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', flexShrink: 1, minWidth: 0 }}>
                {actionLabel}
              </span>

              {tx.txHash && (
                <>
                  <span style={{ margin: '0 8px', color: 'var(--muted)' }}>·</span>
                  <a href={explorerUrl!} target="_blank" rel="noreferrer" style={{ color: 'var(--blue)', textDecoration: 'none', flexShrink: 0 }}>
                    Tx: {tx.txHash.slice(0, 6)}... ↗
                  </a>
                </>
              )}

              {tx.amount && tx.type !== 'payment' && tx.type !== 'deposit' && tx.type !== 'withdrawal' && (
                <>
                  <span style={{ margin: '0 8px', color: 'var(--muted)' }}>·</span>
                  <span style={{ fontWeight: 'bold', flexShrink: 0 }}>
                    {tx.amount} {tx.token || 'STT'}
                  </span>
                </>
              )}

              <span style={{ margin: '0 8px', color: 'var(--muted)' }}>·</span>
              <span style={{ color: 'var(--muted)', flexShrink: 0 }}>
                {tx.type === 'schedule' ? formatDayOnly(tx.timestamp) : formatTime(tx.timestamp)}
              </span>
            </div>
          )
        })}
      </div>
    </div>
  )
}

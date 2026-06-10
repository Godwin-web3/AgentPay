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

export default function History({ userAddress }: { userAddress: string }) {
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
  }, [userAddress])

  if (loading) return (
    <div className="history-view">
      <div className="empty-state">
        <div className="icon" style={{ animation: 'pulse 1.5s infinite', color: 'var(--cyan)' }}>⚡</div>
        <div style={{ fontFamily: 'var(--font-mono)', fontSize: 12 }}>SYNCING FINANCIAL LOG...</div>
      </div>
    </div>
  )

  if (error) return (
    <div className="history-view">
      <div className="empty-state">
        <div className="icon" style={{ color: 'var(--danger)' }}>⚠️</div>
        <div style={{ fontFamily: 'var(--font-mono)', fontSize: 12 }}>ERROR: {error}</div>
      </div>
    </div>
  )

  if (txs.length === 0) return (
    <div className="history-view">
      <div className="empty-state">
        <div className="icon" style={{ color: 'var(--muted)' }}>📭</div>
        <div style={{ fontFamily: 'var(--font-mono)', fontSize: 12 }}>NO FINANCIAL ACTIVITY RECORDED.</div>
      </div>
    </div>
  )

  return (
    <div className="history-view" style={{ paddingBottom: 80 }}>
      <div style={{ marginBottom: 24, borderLeft: '3px solid var(--cyan)', paddingLeft: 16 }}>
        <div style={{ fontSize: 10, color: 'var(--muted)', marginBottom: 4, fontFamily: 'var(--font-mono)', letterSpacing: 2 }}>TERMINAL :: FINANCIAL_LOG</div>
        <div style={{ fontSize: 12, color: 'var(--cyan)', fontFamily: 'var(--font-mono)', fontWeight: 'bold' }}>{userAddress}</div>
      </div>

      <div style={{ 
        border: '1px solid var(--border)',
        background: 'rgba(255, 255, 255, 0.01)',
        fontFamily: 'var(--font-mono)',
        fontSize: 11
      }}>
        {/* Table Header */}
        <div style={{ 
          display: 'grid', 
          gridTemplateColumns: '100px 1fr 100px 120px', 
          padding: '8px 12px', 
          background: 'var(--bg-card)',
          borderBottom: '1px solid var(--border)',
          color: 'var(--muted)',
          fontSize: 9,
          letterSpacing: 1
        }}>
          <div>STATUS</div>
          <div>ACTIVITY / REASON</div>
          <div style={{ textAlign: 'right' }}>AMOUNT</div>
          <div style={{ textAlign: 'right' }}>TIMESTAMP</div>
        </div>

        {txs.map((tx, i) => {
          const explorerUrl = tx.txHash ? 'https://shannon-explorer.somnia.network/tx/' + tx.txHash : null
          
          let actionLabel = tx.label || 'Activity'
          let statusColor = 'var(--cyan)'
          let statusText = '[ OK ]'

          if (tx.status === 'blocked') {
             actionLabel = `BLOCK: ${tx.blockedReason || 'Policy violation'}`
             statusColor = 'var(--danger)'
             statusText = '[ BLKD ]'
          } else if (tx.status === 'pending') {
             statusColor = 'var(--warning)'
             statusText = '[ PEND ]'
          }

          if (tx.type === 'schedule') {
             actionLabel = `SCHED: ${tx.label || ('Pay ' + tx.amount + ' STT')}`
          } else if (tx.type === 'swap') {
             actionLabel = tx.label?.toUpperCase().startsWith('SWAP') ? tx.label : `SWAP: ${tx.label}`
          }

          return (
            <div key={tx.id || i} style={{ 
              display: 'grid',
              gridTemplateColumns: '100px 1fr 100px 120px',
              alignItems: 'center',
              padding: '12px',
              borderBottom: i === txs.length - 1 ? 'none' : '1px solid var(--border)',
              transition: 'background 0.2s',
              cursor: explorerUrl ? 'pointer' : 'default'
            }}
            onClick={() => explorerUrl && window.open(explorerUrl, '_blank')}
            onMouseEnter={(e) => (e.currentTarget.style.background = 'rgba(255, 255, 255, 0.03)')}
            onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
            >
              <div style={{ color: statusColor, fontWeight: 'bold' }}>{statusText}</div>
              
              <div style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', paddingRight: 12 }}>
                {actionLabel.toUpperCase()}
              </div>

              <div style={{ textAlign: 'right', fontWeight: 'bold', color: tx.amount ? 'var(--text)' : 'var(--muted)' }}>
                {tx.amount ? `${tx.amount} ${tx.token || 'STT'}` : '---'}
              </div>

              <div style={{ textAlign: 'right', color: 'var(--muted)', fontSize: 10 }}>
                {tx.type === 'schedule' ? formatDayOnly(tx.timestamp) : formatTime(tx.timestamp).toUpperCase()}
              </div>
            </div>
          )
        })}
      </div>
      
      <div style={{ 
        marginTop: 16, 
        fontFamily: 'var(--font-mono)', 
        fontSize: 9, 
        color: 'var(--muted)',
        textAlign: 'center',
        letterSpacing: 1
      }}>
        ━━━━━━━━━━━━━━ END OF LOG ( TOTAL: {txs.length} ) ━━━━━━━━━━━━━━
      </div>
    </div>
  )
}

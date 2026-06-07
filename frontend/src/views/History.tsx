import { useEffect, useState } from 'react'
import { getHistory } from '../api'

function formatTime(ts: number | string) {
  return new Date(ts).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })
}

function shortAddr(addr: string) {
  if (!addr) return ''
  return addr.slice(0, 6) + '...' + addr.slice(-4)
}

function labelColor(tx: any) {
  if (tx.status === 'blocked') return 'var(--red, #ef4444)'
  if (tx.status === 'pending') return 'var(--yellow, #facc15)'
  if (tx.type === 'deposit') return 'var(--green, #4ade80)'
  if (tx.type === 'withdrawal') return 'var(--yellow, #facc15)'
  if (tx.type === 'swap') return 'var(--purple, #a855f7)'
  if (tx.type === 'inference') return 'var(--blue, #3b82f6)'
  return 'var(--cyan, #22d3ee)'
}

function statusIcon(tx: any) {
  if (tx.status === 'executed') return '✅'
  if (tx.status === 'blocked') return '🚫'
  if (tx.status === 'pending') return '⏳'
  return '❓'
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
      .then(res => setTxs(res.items))
      .catch(() => setError('Failed to load history'))
      .finally(() => setLoading(false))
  }, [userAddress])

  if (loading) return (
    <div className="history-view">
      <div className="empty-state">
        <div className="icon">⚡</div>
        Loading unified history...
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
        No recorded activity.
        <p style={{ fontSize: 11, color: 'var(--muted)', marginTop: 10 }}>Try making a payment or a deposit first.</p>
      </div>
    </div>
  )

  return (
    <div className="history-view">
      <div style={{ marginBottom: 20 }}>
        <div style={{ fontSize: 10, color: 'var(--muted)', marginBottom: 4, fontFamily: 'var(--font-mono)' }}>UNIFIED ACTIVITY LOG FOR</div>
        <div style={{ fontSize: 12, color: 'var(--blue)', fontFamily: 'var(--font-mono)' }}>{userAddress || 'Not Connected'}</div>
      </div>
      
      <div className="section-title" style={{ marginBottom: 16, display: 'flex', justifyContent: 'space-between' }}>
        <span>Activity Feed</span>
        <span style={{ fontSize: 10, opacity: 0.6 }}>{txs.length} records</span>
      </div>

      {txs.map((tx, i) => {
        const explorerUrl = tx.txHash ? 'https://shannon-explorer.somnia.network/tx/' + tx.txHash : null
        const proofUrl = tx.requestId ? 'https://shannon-explorer.somnia.network/address/0x4471917E96271F688282ae283d62De0B5Be8084C' : null // Vault address for proofs

        return (
          <div className="log-item" key={tx.id || i} style={{ opacity: tx.status === 'blocked' ? 0.7 : 1 }}>
            <div className="log-status-icon">{statusIcon(tx)}</div>
            <div className="log-details">
              <div className="log-reason" style={{ color: labelColor(tx), fontWeight: 'bold' }}>
                {tx.label || 'Activity'}
              </div>
              
              {tx.reason && (
                <div style={{ fontSize: 11, color: 'var(--foreground)', marginTop: 2 }}>{tx.reason}</div>
              )}

              {tx.blockedReason && (
                <div style={{ fontSize: 10, color: 'var(--red)', marginTop: 2, fontStyle: 'italic' }}>
                  Blocked: {tx.blockedReason}
                </div>
              )}

              {tx.condition && (
                <div style={{ fontSize: 10, color: 'var(--yellow)', marginTop: 2 }}>
                  Trigger: {tx.condition}
                </div>
              )}

              <div style={{ display: 'flex', gap: 8, marginTop: 4 }}>
                {tx.to && (
                  <div className="log-address" style={{ fontSize: 9 }}>To: {shortAddr(tx.to)}</div>
                )}
                
                {tx.txHash && (
                  <a href={explorerUrl!} target="_blank" rel="noreferrer" style={{ fontFamily: 'var(--font-mono)', fontSize: 9, color: 'var(--blue)', textDecoration: 'none' }}>
                    Tx: {tx.txHash.slice(0, 10)}... ↗
                  </a>
                )}

                {tx.requestId && (
                  <div style={{ fontFamily: 'var(--font-mono)', fontSize: 9, color: 'var(--purple)' }}>
                    Proof: {tx.requestId.slice(0, 10)}...
                    {tx.verifiable && <span title="Verifiable Proof Available" style={{ marginLeft: 2 }}>🛡️</span>}
                  </div>
                )}
              </div>
            </div>
            
            <div style={{ textAlign: 'right' }}>
              <div className="log-amount" style={{ color: tx.type === 'deposit' ? 'var(--green)' : tx.type === 'withdrawal' ? 'var(--yellow)' : 'inherit' }}>
                {tx.amount ? `${tx.amount} ${tx.token || 'STT'}` : '--'}
              </div>
              <div className="log-time" style={{ fontSize: 9, opacity: 0.5 }}>{formatTime(tx.timestamp)}</div>
            </div>
          </div>
        )
      })}
    </div>
  )
}
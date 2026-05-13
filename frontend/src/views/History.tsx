import { useEffect, useState } from 'react'
import { getHistory } from '../api'

const CONTRACT = '0x7E5235C0c711Cf2CA57a18d7BFD79a8cd453793D'.toLowerCase()

function formatTime(ts: string) {
  return new Date(ts).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })
}

function shortAddr(addr: string) {
  return addr.slice(0, 6) + '...' + addr.slice(-4)
}

function txLabel(tx: any) {
  const raw = tx.raw_input ?? ''
  if (raw.startsWith('0xd0e30db0')) return 'Deposit'
  if (raw.startsWith('0x2e1a7d4d')) return 'Withdraw'
  return 'Contract Call'
}

function labelColor(label: string) {
  if (label === 'Deposit') return 'var(--green, #4ade80)'
  if (label === 'Withdraw') return 'var(--yellow, #facc15)'
  return 'var(--muted)'
}

function statusIcon(tx: any) {
  if (tx.status === 'ok') return '✅'
  if (tx.status === 'error') return '❌'
  return '⏳'
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
        Loading history...
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
        No transactions yet
      </div>
    </div>
  )

  return (
    <div className="history-view">
      <div style={{ marginBottom: 20 }}>
        <div style={{ fontSize: 10, color: 'var(--muted)', marginBottom: 4, fontFamily: 'var(--font-mono)' }}>VIEWING HISTORY FOR</div>
        <div style={{ fontSize: 12, color: 'var(--blue)', fontFamily: 'var(--font-mono)' }}>{userAddress || 'Not Connected'}</div>
      </div>
      <div className="section-title" style={{ marginBottom: 16 }}>
        Transaction Log — {txs.length} records
      </div>
      {txs.map((tx, i) => {
        const label = txLabel(tx)
        const value = tx.value ? (Number(BigInt(tx.value)) / 1e18).toFixed(4) : '0.0000'
        const explorerUrl = 'https://shannon-explorer.somnia.network/tx/' + tx.hash
        return (
          <div className="log-item" key={i}>
            <div className="log-status-icon">{statusIcon(tx)}</div>
            <div className="log-details">
              <div className="log-address">{shortAddr(tx.to?.hash ?? CONTRACT)}</div>
              <div className="log-reason" style={{ color: labelColor(label) }}>{label}</div>
              <a href={explorerUrl} target="_blank" rel="noreferrer" style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--blue)', textDecoration: 'none', marginTop: 2, display: 'block' }}>
                {tx.hash.slice(0, 16)}... ↗
              </a>
            </div>
            <div className="log-amount">{value} STT</div>
            <div className="log-time">{formatTime(tx.timestamp)}</div>
          </div>
        )
      })}
    </div>
  )
}
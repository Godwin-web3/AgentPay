import { useEffect, useState } from 'react'
import { getHistory } from '../api'
import type { HistoryLog } from '../types'

function formatTime(ts: number) {
  return new Date(ts).toLocaleString([], {
    month: 'short', day: 'numeric',
    hour: '2-digit', minute: '2-digit'
  })
}

function shortAddr(addr: string) {
  return addr.slice(0, 6) + '...' + addr.slice(-4)
}

function StatusIcon({ log }: { log: HistoryLog }) {
  if (!log.failed && log.txHash) return <span>✅</span>
  if (log.failed && log.blockedReason) return <span>🚫</span>
  return <span>⚠️</span>
}

function statusClass(log: HistoryLog) {
  if (!log.failed && log.txHash) return 'success'
  if (log.failed && log.blockedReason) return 'rejected'
  return 'failed'
}

export default function History() {
  const [logs, setLogs] = useState<HistoryLog[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    getHistory()
      .then(res => setLogs(res.logs))
      .catch(() => setLogs([]))
      .finally(() => setLoading(false))
  }, [])

  if (loading) return (
    <div className="history-view">
      <div className="empty-state">
        <div className="icon">⚡</div>
        Loading history...
      </div>
    </div>
  )

  if (logs.length === 0) return (
    <div className="history-view">
      <div className="empty-state">
        <div className="icon">📭</div>
        No transactions yet
      </div>
    </div>
  )

  return (
    <div className="history-view">
      <div className="section-title" style={{ marginBottom: 16 }}>
        Transaction Log — {logs.length} records
      </div>

      {logs.map((log, i) => (
        <div className="log-item" key={i}>
          <div className="log-status-icon">
            <StatusIcon log={log} />
          </div>

          <div className="log-details">
            <div className="log-address">{shortAddr(log.to)}</div>
            <div className="log-reason">
              {log.blockedReason || log.reason || 'Payment'}
            </div>
            {log.txHash && (
              <a
                href={`https://shannon-explorer.somnia.network/tx/${log.txHash}`}
                target="_blank"
                rel="noreferrer"
                style={{
                  fontFamily: 'var(--font-mono)',
                  fontSize: 10,
                  color: 'var(--blue)',
                  textDecoration: 'none',
                  marginTop: 2,
                  display: 'block'
                }}
              >
                {log.txHash.slice(0, 16)}... ↗
              </a>
            )}
          </div>

          <div className={`log-amount ${statusClass(log)}`}>
            {log.amount} STT
          </div>

          <div className="log-time">
            {formatTime(log.timestamp)}
          </div>
        </div>
      ))}
    </div>
  )
}

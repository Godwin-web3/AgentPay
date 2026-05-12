import { useEffect, useState } from 'react'
import { api } from '../services/api'

interface TxRecord {
  requestId: string
  to: string
  amount: number
  reason: string
  failed: boolean
  blockedReason?: string
  txHash?: string
  timestamp: number
  date: string
}

const S = {
  page: { height: '100%', overflowY: 'auto' as const, padding: 28, background: '#0A0A0A' },
  header: { display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', marginBottom: 24, paddingBottom: 16, borderBottom: '1px solid #262626' },
  h1: { fontFamily: 'Anybody', fontSize: 28, fontWeight: 700, color: '#e5e2e1', margin: 0 },
  sub: { fontFamily: 'Geist', fontSize: 13, color: '#bbcac6', marginTop: 4 },
  tableWrap: { background: '#141414', border: '1px solid #262626', marginBottom: 12 },
  th: { padding: '10px 14px', fontFamily: 'JetBrains Mono', fontSize: 10, letterSpacing: '0.08em', textTransform: 'uppercase' as const, color: '#bbcac6', textAlign: 'left' as const, borderBottom: '1px solid #262626', background: '#0A0A0A' },
  td: { padding: '11px 14px', fontFamily: 'JetBrains Mono', fontSize: 11, borderBottom: '1px solid #1a1a1a', color: '#e5e2e1' },
  statsRow: { display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12 },
  statCard: { background: '#141414', border: '1px solid #262626', padding: 16 },
  statLabel: { fontFamily: 'JetBrains Mono', fontSize: 10, letterSpacing: '0.1em', textTransform: 'uppercase' as const, color: '#bbcac6', marginBottom: 8 },
}

const badge = (ok: boolean, label: string) => (
  <span style={{
    padding: '2px 8px', fontFamily: 'JetBrains Mono', fontSize: 10, fontWeight: 700,
    letterSpacing: '0.05em', textTransform: 'uppercase' as const,
    background: ok ? 'rgba(79,219,200,0.1)' : 'rgba(255,180,171,0.1)',
    color: ok ? '#4fdbc8' : '#ffb4ab',
    border: `1px solid ${ok ? 'rgba(79,219,200,0.3)' : 'rgba(255,180,171,0.3)'}`,
  }}>{label}</span>
)

export default function Ledger({ apiKey }: { apiKey: string }) {
  const [logs, setLogs] = useState<TxRecord[]>([])
  const [filter, setFilter] = useState<'all' | 'executed' | 'rejected'>('all')
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!apiKey) { setLoading(false); return }
    api.history(apiKey)
      .then(data => setLogs(data.logs || []))
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [apiKey])

  const filtered = logs.filter(tx =>
    filter === 'all' ? true : filter === 'executed' ? !tx.failed : tx.failed
  )

  return (
    <div style={S.page}>
      <div style={S.header}>
        <div>
          <h2 style={S.h1}>Network Ledger</h2>
          <p style={S.sub}>Real-time verification of agent-mediated transactions.</p>
        </div>
        <div style={{ display: 'flex', gap: 6 }}>
          {(['all', 'executed', 'rejected'] as const).map(f => (
            <button key={f} onClick={() => setFilter(f)} style={{
              padding: '6px 14px', fontFamily: 'JetBrains Mono', fontSize: 10,
              fontWeight: 700, letterSpacing: '0.05em', textTransform: 'uppercase',
              cursor: 'pointer', transition: 'all 0.1s linear',
              background: filter === f ? 'rgba(79,219,200,0.1)' : 'transparent',
              color: filter === f ? '#4fdbc8' : '#bbcac6',
              border: `1px solid ${filter === f ? 'rgba(79,219,200,0.4)' : '#262626'}`,
            }}>
              {f}
            </button>
          ))}
        </div>
      </div>

      {/* Table */}
      <div style={S.tableWrap}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr>
              {['Timestamp','Request ID','Recipient','Amount','Reason','Status','TX Hash'].map(h => (
                <th key={h} style={S.th}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={7} style={{ ...S.td, textAlign: 'center', color: '#bbcac6', padding: 40 }}>Loading...</td></tr>
            ) : !apiKey ? (
              <tr><td colSpan={7} style={{ ...S.td, textAlign: 'center', color: '#bbcac6', padding: 40 }}>Enter your API key in Terminal to view history.</td></tr>
            ) : filtered.length === 0 ? (
              <tr><td colSpan={7} style={{ ...S.td, textAlign: 'center', color: '#bbcac6', padding: 40 }}>No transactions found.</td></tr>
            ) : filtered.map((tx, i) => (
              <tr key={i} style={{ background: i % 2 === 0 ? '#141414' : '#111' }}>
                <td style={{ ...S.td, color: '#bbcac6' }}>{new Date(tx.timestamp).toLocaleTimeString()}</td>
                <td style={{ ...S.td, color: '#bbcac6' }}>{tx.requestId?.slice(0, 10)}...</td>
                <td style={{ ...S.td, color: '#4fdbc8' }}>{tx.to?.slice(0, 8)}...{tx.to?.slice(-4)}</td>
                <td style={S.td}>{tx.amount} STT</td>
                <td style={{ ...S.td, color: '#bbcac6' }}>{tx.reason}</td>
                <td style={S.td}>{badge(!tx.failed, tx.failed ? (tx.blockedReason || 'rejected') : 'executed')}</td>
                <td style={S.td}>
                  {tx.txHash
                    ? <a href={`https://shannon-explorer.somnia.network/tx/${tx.txHash}`} target="_blank" rel="noreferrer" style={{ color: '#4fdbc8', textDecoration: 'none' }}>{tx.txHash.slice(0, 10)}...</a>
                    : <span style={{ color: '#444' }}>N/A</span>
                  }
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Stats */}
      <div style={S.statsRow}>
        {[
          { label: 'Total Records', value: String(logs.length), color: '#e5e2e1' },
          { label: 'Executed', value: String(logs.filter(t => !t.failed).length), color: '#4fdbc8' },
          { label: 'Rejected', value: String(logs.filter(t => t.failed).length), color: '#ffb4ab' },
          { label: 'Settlement Time', value: '~400ms', color: '#e5e2e1' },
        ].map((s, i) => (
          <div key={i} style={S.statCard}>
            <p style={S.statLabel}>{s.label}</p>
            <p style={{ fontFamily: 'Anybody', fontSize: 22, fontWeight: 700, color: s.color }}>{s.value}</p>
          </div>
        ))}
      </div>
    </div>
  )
}

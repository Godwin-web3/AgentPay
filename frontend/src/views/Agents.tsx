import { useEffect, useState } from 'react'
import { api } from '../services/api'

interface Agent {
  address: string
  agentId: string
  name: string
  description: string
  reputation: { score: number; approved: number; rejected: number; total: number }
  registeredAt: string
}

const S = {
  page: { height: '100%', overflowY: 'auto' as const, padding: 28, background: '#0A0A0A' },
  header: { marginBottom: 24, paddingBottom: 16, borderBottom: '1px solid #262626' },
  h1: { fontFamily: 'Anybody', fontSize: 28, fontWeight: 700, color: '#e5e2e1', margin: 0 },
  sub: { fontFamily: 'Geist', fontSize: 13, color: '#bbcac6', marginTop: 4 },
  statsRow: { display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12, marginBottom: 16 },
  statCard: { background: '#141414', border: '1px solid #262626', padding: 16 },
  statLabel: { fontFamily: 'JetBrains Mono', fontSize: 10, letterSpacing: '0.1em', textTransform: 'uppercase' as const, color: '#bbcac6', marginBottom: 8 },
  tableWrap: { background: '#141414', border: '1px solid #262626' },
  tableHeader: { padding: '10px 14px', borderBottom: '1px solid #262626', background: '#0A0A0A', display: 'flex', justifyContent: 'space-between', alignItems: 'center' },
  th: { padding: '10px 14px', fontFamily: 'JetBrains Mono', fontSize: 10, letterSpacing: '0.08em', textTransform: 'uppercase' as const, color: '#bbcac6', textAlign: 'left' as const, borderBottom: '1px solid #262626' },
  td: { padding: '12px 14px', fontFamily: 'JetBrains Mono', fontSize: 12, borderBottom: '1px solid #1a1a1a', color: '#e5e2e1' },
}

export default function Agents() {
  const [agents, setAgents] = useState<Agent[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    api.agents()
      .then(data => setAgents(data.agents || []))
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [])

  const avgRep = agents.length
    ? Math.round(agents.reduce((a, g) => a + g.reputation.score, 0) / agents.length)
    : null

  return (
    <div style={S.page}>
      <div style={S.header}>
        <h1 style={S.h1}>Registered Agents</h1>
        <p style={S.sub}>Monitor reputation, activity and performance clusters.</p>
      </div>

      {/* Stats */}
      <div style={S.statsRow}>
        {[
          { label: 'Total Agents', value: String(agents.length), color: '#4fdbc8' },
          { label: 'Avg Reputation', value: avgRep ? `${avgRep}%` : '—', color: '#e5e2e1' },
          { label: 'Active Clusters', value: '1', color: '#e5e2e1' },
          { label: 'Network Load', value: '~12ms', color: '#ffb59e' },
        ].map((s, i) => (
          <div key={i} style={S.statCard}>
            <p style={S.statLabel}>{s.label}</p>
            <p style={{ fontFamily: 'Anybody', fontSize: 22, fontWeight: 700, color: s.color }}>{s.value}</p>
          </div>
        ))}
      </div>

      {/* Table */}
      <div style={S.tableWrap}>
        <div style={S.tableHeader}>
          <span style={{ fontFamily: 'JetBrains Mono', fontSize: 11, fontWeight: 700, letterSpacing: '0.08em', color: '#e5e2e1' }}>REGISTRY LEDGER</span>
          <span style={{ fontFamily: 'JetBrains Mono', fontSize: 10, color: '#bbcac6' }}>{agents.length} agents</span>
        </div>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr style={{ background: '#0A0A0A' }}>
              {['Agent ID', 'Name', 'Reputation', 'Approved', 'Rejected', 'Registered'].map(h => (
                <th key={h} style={S.th}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={6} style={{ ...S.td, textAlign: 'center', color: '#bbcac6', padding: 32 }}>Loading agents...</td></tr>
            ) : agents.length === 0 ? (
              <tr><td colSpan={6} style={{ ...S.td, textAlign: 'center', color: '#bbcac6', padding: 32 }}>No agents registered yet.</td></tr>
            ) : agents.map((agent, i) => (
              <tr key={i}>
                <td style={{ ...S.td, color: '#4fdbc8' }}>{agent.agentId.slice(0, 12)}...</td>
                <td style={S.td}>{agent.name}</td>
                <td style={S.td}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span style={{ color: '#4fdbc8', minWidth: 28 }}>{agent.reputation.score}</span>
                    <div style={{ flex: 1, height: 3, background: '#262626' }}>
                      <div style={{ width: `${agent.reputation.score}%`, height: '100%', background: '#4fdbc8' }} />
                    </div>
                  </div>
                </td>
                <td style={{ ...S.td, color: '#4fdbc8' }}>{agent.reputation.approved}</td>
                <td style={{ ...S.td, color: '#ffb4ab' }}>{agent.reputation.rejected}</td>
                <td style={{ ...S.td, color: '#bbcac6' }}>{new Date(agent.registeredAt).toLocaleDateString()}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

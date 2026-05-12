import { useEffect, useState } from 'react'
import { api } from '../services/api'
import { Tab } from '../App'
import { useAccount } from 'wagmi'

interface Activity {
  time: string
  agentId: string
  action: string
  value: string
  status: string
}

const S = {
  page: { height: '100%', overflowY: 'auto' as const, padding: 28, background: '#0A0A0A' },
  header: { display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', marginBottom: 24, paddingBottom: 16, borderBottom: '1px solid #262626' },
  h1: { fontFamily: 'Anybody', fontSize: 28, fontWeight: 700, color: '#e5e2e1', margin: 0 },
  sub: { fontFamily: 'Geist', fontSize: 13, color: '#bbcac6', marginTop: 4 },
  statsRow: { display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12, marginBottom: 16 },
  card: { background: '#141414', border: '1px solid #262626', padding: 16, display: 'flex', flexDirection: 'column' as const, justifyContent: 'space-between', gap: 12 },
  cardLabel: { fontFamily: 'JetBrains Mono', fontSize: 10, letterSpacing: '0.1em', textTransform: 'uppercase' as const, color: '#bbcac6' },
  cardValue: { fontFamily: 'Anybody', fontSize: 24, fontWeight: 700, color: '#e5e2e1' },
  cardSub: { fontFamily: 'JetBrains Mono', fontSize: 10, color: '#bbcac6' },
  progressTrack: { width: '100%', height: 3, background: '#0A0A0A', border: '1px solid #262626' },
  grid: { display: 'grid', gridTemplateColumns: '7fr 5fr', gap: 12 },
  tableWrap: { background: '#141414', border: '1px solid #262626' },
  tableHead: { background: '#0A0A0A', borderBottom: '1px solid #262626' },
  th: { padding: '10px 14px', fontFamily: 'JetBrains Mono', fontSize: 10, letterSpacing: '0.08em', textTransform: 'uppercase' as const, color: '#bbcac6', textAlign: 'left' as const },
  td: { padding: '10px 14px', fontFamily: 'JetBrains Mono', fontSize: 12, borderBottom: '1px solid #1a1a1a', color: '#e5e2e1' },
  badge: (ok: boolean) => ({
    display: 'inline-block', padding: '2px 8px',
    fontFamily: 'JetBrains Mono', fontSize: 10, fontWeight: 700, textTransform: 'uppercase' as const, letterSpacing: '0.05em',
    background: ok ? 'rgba(79,219,200,0.1)' : 'rgba(255,180,171,0.1)',
    color: ok ? '#4fdbc8' : '#ffb4ab',
    border: `1px solid ${ok ? 'rgba(79,219,200,0.3)' : 'rgba(255,180,171,0.3)'}`,
  }),
  perfCard: { background: '#141414', border: '1px solid #262626', padding: 16, display: 'flex', flexDirection: 'column' as const, gap: 12 },
  shelf: { display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12, marginTop: 12 },
  shelfItem: (highlight: boolean) => ({
    padding: 12, display: 'flex', alignItems: 'center', gap: 10,
    background: highlight ? 'rgba(79,219,200,0.05)' : '#141414',
    border: `1px solid ${highlight ? 'rgba(79,219,200,0.2)' : '#262626'}`,
  }),
}

export default function Dashboard({ onNavigate, apiKey }: { onNavigate: (tab: Tab) => void, apiKey: string }) {
  const { address: userAddress } = useAccount()
  const [health, setHealth] = useState<{ status: string; time: string; address?: string } | null>(null)
  const [policy, setPolicy] = useState<any>(null)
  const [activity, setActivity] = useState<Activity[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const fetchData = async () => {
      try {
        const [h, p] = await Promise.all([
          api.health(),
          api.policy(userAddress || '')
        ])
        setHealth(h)
        setPolicy(p)

        if (apiKey) {
          const hist = await api.history(apiKey)
          const formatted: Activity[] = hist.logs.map((l: any) => ({
            time: new Date(l.timestamp).toLocaleTimeString(),
            agentId: l.agentId ? l.agentId.slice(0, 8) : 'SYSTEM',
            action: l.failed ? 'Blocked: ' + l.blockedReason : l.reason,
            value: l.amount + ' STT',
            status: l.failed ? 'rejected' : 'executed'
          }))
          setActivity(formatted.slice(0, 5))
        }
      } catch (err) {
        console.error('Failed to fetch dashboard data:', err)
      } finally {
        setLoading(false)
      }
    }

    fetchData()
    const int = setInterval(fetchData, 10000)
    return () => clearInterval(int)
  }, [userAddress, apiKey])

  const spendPct = policy ? (policy.dailySpendSoFar / policy.dailyCap) * 100 : 0

  return (
    <div style={S.page}>
      <div style={S.header}>
        <div>
          <h2 style={S.h1}>Dashboard</h2>
          <p style={S.sub}>Real-time performance monitoring and treasury limits.</p>
        </div>
        <div style={{ display: 'flex', gap: 8, fontFamily: 'JetBrains Mono', fontSize: 11 }}>
          <span style={{ color: '#bbcac6' }}>Last update:</span>
          <span style={{ color: '#4fdbc8' }}>{health?.time ? new Date(health.time).toUTCString().slice(0, 25) : '—'}</span>
        </div>
      </div>

      {/* Stats Strip */}
      <div style={S.statsRow}>
        <div style={S.card}>
          <p style={S.cardLabel}>Daily Spend</p>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 6 }}>
            <span style={S.cardValue}>{policy?.dailySpendSoFar ?? '0'}</span>
            <span style={{ fontFamily: 'JetBrains Mono', fontSize: 12, color: '#bbcac6' }}>/ {policy?.dailyCap ?? '—'} STT</span>
          </div>
          <div>
            <div style={S.progressTrack}>
              <div style={{ width: `${Math.min(100, spendPct)}%`, height: '100%', background: '#4fdbc8' }} />
            </div>
            <p style={{ ...S.cardLabel, marginTop: 6 }}>{spendPct.toFixed(2)}% of quota exhausted</p>
          </div>
        </div>

        <div style={S.card}>
          <p style={S.cardLabel}>Remaining Cap</p>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 6 }}>
            <span style={S.cardValue}>{policy?.dailyRemaining ?? '—'}</span>
            <span style={{ fontFamily: 'JetBrains Mono', fontSize: 12, color: '#bbcac6' }}>STT</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <span className="material-symbols-outlined" style={{ fontSize: 13, color: '#4fdbc8' }}>check_circle</span>
            <p style={{ ...S.cardLabel, color: '#4fdbc8' }}>Liquidity adequate</p>
          </div>
        </div>

        <div style={S.card}>
          <p style={S.cardLabel}>Per-TX Cap</p>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 6 }}>
            <span style={S.cardValue}>{policy?.perTxCap ?? '—'}</span>
            <span style={{ fontFamily: 'JetBrains Mono', fontSize: 12, color: '#bbcac6' }}>STT max</span>
          </div>
          <div style={{ height: 28, display: 'flex', alignItems: 'flex-end', gap: 2 }}>
            {[40,60,55,80,70,95,100,85].map((h, i) => (
              <div key={i} style={{ flex: 1, height: `${h}%`, background: i >= 6 ? '#4fdbc8' : 'rgba(79,219,200,0.15)' }} />
            ))}
          </div>
        </div>

        <div style={S.card}>
          <p style={S.cardLabel}>Circuit Breaker</p>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <div style={{ width: 8, height: 8, borderRadius: '50%', background: policy?.circuitBreaker?.paused ? '#ffb4ab' : '#4fdbc8' }} />
            <span style={S.cardValue}>{policy?.circuitBreaker?.paused ? 'PAUSED' : 'HEALTHY'}</span>
          </div>
          <p style={{ ...S.cardLabel, color: policy?.circuitBreaker?.paused ? '#ffb4ab' : '#4fdbc8' }}>
            {policy?.circuitBreaker?.paused ? 'Auto-halt active' : 'Auto-halt armed'}
          </p>
        </div>
      </div>

      {/* Main Grid */}
      <div style={S.grid}>
        {/* Activity Table */}
        <div style={S.tableWrap}>
          <div style={{ padding: '10px 14px', borderBottom: '1px solid #262626', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontFamily: 'JetBrains Mono', fontSize: 11, fontWeight: 700, letterSpacing: '0.08em', color: '#e5e2e1' }}>RECENT ACTIVITY</span>
            <button onClick={() => onNavigate('ledger')} style={{ fontFamily: 'JetBrains Mono', fontSize: 10, color: '#4fdbc8', background: 'none', border: 'none', cursor: 'pointer', letterSpacing: '0.05em' }}>
              VIEW FULL LEDGER →
            </button>
          </div>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ background: '#0A0A0A', borderBottom: '1px solid #262626' }}>
                {['TIMESTAMP','AGENT ID','ACTION','VALUE','STATUS'].map(h => (
                  <th key={h} style={S.th}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {activity.length === 0 ? (
                <tr>
                  <td colSpan={5} style={{ ...S.td, textAlign: 'center', color: '#444', padding: 32 }}>
                    {loading ? 'SYNCING...' : 'NO RECENT ACTIVITY'}
                  </td>
                </tr>
              ) : activity.map((row, i) => (
                <tr key={i} style={{ borderBottom: '1px solid #1a1a1a' }}>
                  <td style={{ ...S.td, color: '#bbcac6' }}>{row.time}</td>
                  <td style={{ ...S.td, color: '#4fdbc8' }}>{row.agentId}</td>
                  <td style={{ ...S.td, fontFamily: 'Geist', color: '#e5e2e1' }}>{row.action}</td>
                  <td style={S.td}>{row.value}</td>
                  <td style={S.td}><span style={S.badge(row.status === 'executed')}>{row.status}</span></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Agent Performance */}
        <div style={S.perfCard}>
          <div>
            <p style={{ fontFamily: 'JetBrains Mono', fontSize: 11, fontWeight: 700, letterSpacing: '0.08em', color: '#e5e2e1' }}>AGENT PERFORMANCE</p>
            <p style={{ fontFamily: 'Geist', fontSize: 12, color: '#bbcac6', marginTop: 2 }}>Reputation clusters by utility.</p>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14, flex: 1, justifyContent: 'center' }}>
            {[
              { label: 'PAYMENT AGENTS (A)', score: 98.2 },
              { label: 'TRADING AGENTS (B)', score: 84.5 },
              { label: 'GOVERNANCE AGENTS (C)', score: 71.0 },
              { label: 'SECURITY AGENTS (D)', score: 99.9 },
            ].map((g, i) => (
              <div key={i}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                  <span style={{ fontFamily: 'JetBrains Mono', fontSize: 10, color: '#e5e2e1' }}>{g.label}</span>
                  <span style={{ fontFamily: 'JetBrains Mono', fontSize: 10, color: '#4fdbc8' }}>{g.score}</span>
                </div>
                <div style={{ height: 3, background: '#1a1a1a', border: '1px solid #262626' }}>
                  <div style={{ width: `${g.score}%`, height: '100%', background: '#4fdbc8' }} />
                </div>
              </div>
            ))}
          </div>
          <div style={{ padding: '8px 12px', background: '#0A0A0A', border: '1px solid #262626', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontFamily: 'JetBrains Mono', fontSize: 10, color: '#bbcac6' }}>AGGREGATED SCORE</span>
            <span style={{ fontFamily: 'JetBrains Mono', fontSize: 20, fontWeight: 700, color: '#4fdbc8' }}>88.4</span>
          </div>
        </div>
      </div>

      {/* Bottom Shelf */}
      <div style={S.shelf}>
        {[
          { icon: 'verified_user', label: 'AUTHENTICATION', value: 'API key authentication active.', highlight: true },
          { icon: 'history', label: 'WORKER STATUS', value: health?.status === 'ok' ? 'Online' : 'Checking...', highlight: false },
          { icon: 'lan', label: 'NETWORK', value: 'Somnia Testnet (50312)', highlight: false },
        ].map((item, i) => (
          <div key={i} style={S.shelfItem(item.highlight)}>
            <span className="material-symbols-outlined" style={{ fontSize: 18, color: item.highlight ? '#4fdbc8' : '#bbcac6' }}>{item.icon}</span>
            <div>
              <p style={{ fontFamily: 'JetBrains Mono', fontSize: 10, color: item.highlight ? '#4fdbc8' : '#bbcac6', letterSpacing: '0.08em' }}>{item.label}</p>
              <p style={{ fontFamily: 'Geist', fontSize: 12, color: '#e5e2e1', marginTop: 2 }}>{item.value}</p>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

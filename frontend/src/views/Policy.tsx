import { useEffect, useState } from 'react'
import { api } from '../services/api'
import { useAccount } from 'wagmi'

const S = {
  page: { height: '100%', overflowY: 'auto' as const, padding: 28, background: '#0A0A0A' },
  header: { display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', marginBottom: 24, paddingBottom: 16, borderBottom: '1px solid #262626' },
  h1: { fontFamily: 'Anybody', fontSize: 28, fontWeight: 700, color: '#e5e2e1', margin: 0 },
  sub: { fontFamily: 'Geist', fontSize: 13, color: '#bbcac6', marginTop: 4 },
  grid: { display: 'grid', gridTemplateColumns: '4fr 8fr', gap: 12 },
  card: { background: '#141414', border: '1px solid #262626', padding: 20 },
  cardTitle: { fontFamily: 'JetBrains Mono', fontSize: 10, fontWeight: 700, letterSpacing: '0.1em', color: '#4fdbc8', marginBottom: 16 },
  row: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 0', borderBottom: '1px solid #1a1a1a' },
  rowLabel: { fontFamily: 'Geist', fontSize: 13, color: '#bbcac6' },
  rowValue: { fontFamily: 'JetBrains Mono', fontSize: 12, color: '#e5e2e1' },
  statsRow: { display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12, marginTop: 12 },
  statCard: { background: '#141414', border: '1px solid #262626', padding: 16 },
  statLabel: { fontFamily: 'JetBrains Mono', fontSize: 10, letterSpacing: '0.1em', textTransform: 'uppercase' as const, color: '#bbcac6', marginBottom: 8 },
  statValue: { fontFamily: 'Anybody', fontSize: 22, fontWeight: 700, color: '#e5e2e1' },
}

const badge = (text: string, type: 'green' | 'amber' | 'red') => {
  const colors = {
    green: { bg: 'rgba(79,219,200,0.1)', color: '#4fdbc8', border: 'rgba(79,219,200,0.3)' },
    amber: { bg: 'rgba(255,181,158,0.1)', color: '#ffb59e', border: 'rgba(255,181,158,0.3)' },
    red:   { bg: 'rgba(255,180,171,0.1)', color: '#ffb4ab', border: 'rgba(255,180,171,0.3)' },
  }[type]
  return (
    <span style={{
      padding: '2px 8px', fontFamily: 'JetBrains Mono', fontSize: 10, fontWeight: 700,
      letterSpacing: '0.05em', textTransform: 'uppercase' as const,
      background: colors.bg, color: colors.color, border: `1px solid ${colors.border}`,
    }}>{text}</span>
  )
}

export default function Policy() {
  const { address: userAddress } = useAccount()
  const [policy, setPolicy] = useState<Record<string, any> | null>(null)

  useEffect(() => {
    if (userAddress) {
      api.policy(userAddress).then(setPolicy).catch(() => {})
    }
  }, [userAddress])

  return (
    <div style={S.page}>
      <div style={S.header}>
        <div>
          <h2 style={S.h1}>Policy Configuration</h2>
          <p style={S.sub}>Active enforcement rules for autonomous agent execution.</p>
        </div>
        {badge(policy ? 'ENFORCED' : 'SYNCING', policy ? 'green' : 'amber')}
      </div>

      <div style={S.grid}>
        {/* Left — Rules */}
        <div style={S.card}>
          <p style={S.cardTitle}>ACTIVE ENFORCEMENT POLICY</p>

          {/* IF/THEN logic gate style */}
          <div style={{ fontFamily: 'JetBrains Mono', fontSize: 11, color: '#bbcac6', marginBottom: 16, padding: 12, background: '#0A0A0A', border: '1px solid #262626' }}>
            <span style={{ color: '#4fdbc8' }}>IF</span> tx.amount {'>'} perTxCap<br />
            <span style={{ color: '#ffb4ab', marginLeft: 8 }}>THEN</span> REJECT + log<br />
            <span style={{ color: '#4fdbc8', marginLeft: 0 }}>IF</span> dailySpend {'>'} dailyCap<br />
            <span style={{ color: '#ffb4ab', marginLeft: 8 }}>THEN</span> HALT circuit
          </div>

          <div style={S.row}>
            <span style={S.rowLabel}>Max Transaction</span>
            <span style={S.rowValue}>{policy ? `${policy.perTxCap} STT` : '—'}</span>
          </div>
          <div style={S.row}>
            <span style={S.rowLabel}>Daily Limit</span>
            <span style={S.rowValue}>{policy ? `${policy.dailyCap} STT` : '—'}</span>
          </div>
          <div style={S.row}>
            <span style={S.rowLabel}>Daily Spent</span>
            <span style={{ ...S.rowValue, color: '#4fdbc8' }}>{policy ? `${policy.dailySpendSoFar} STT` : '—'}</span>
          </div>
          <div style={{ ...S.row, borderBottom: 'none' }}>
            <span style={S.rowLabel}>Strict Enforcement</span>
            <div style={{ width: 36, height: 20, background: '#4fdbc8', borderRadius: 10, position: 'relative' }}>
              <div style={{ position: 'absolute', top: 2, right: 2, width: 16, height: 16, background: '#003731', borderRadius: '50%' }} />
            </div>
          </div>

          <div style={{ marginTop: 16 }}>
            <p style={{ ...S.cardTitle, marginBottom: 8 }}>RECIPIENT WHITELIST</p>
            <div style={{ background: '#0A0A0A', border: '1px solid #262626', padding: 10, fontFamily: 'JetBrains Mono', fontSize: 11 }}>
              {policy && Array.isArray(policy.whitelist) && (policy.whitelist as string[]).length > 0
                ? (policy.whitelist as string[]).map((addr, i) => (
                  <div key={i} style={{ color: '#4fdbc8', marginBottom: 4 }}>{addr.slice(0, 10)}...{addr.slice(-4)}</div>
                ))
                : <span style={{ color: '#bbcac6' }}>Open — no restrictions</span>
              }
            </div>
          </div>
        </div>

        {/* Right — Circuit Breaker */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div style={S.card}>
            <p style={S.cardTitle}>CIRCUIT BREAKER CONFIG</p>
            {policy && policy.circuitBreaker && typeof policy.circuitBreaker === 'object'
              ? Object.entries(policy.circuitBreaker as Record<string, unknown>).map(([key, val]) => (
                <div key={key} style={S.row}>
                  <span style={S.rowLabel}>{key}</span>
                  <span style={S.rowValue}>{String(val)}</span>
                </div>
              ))
              : (
                <>
                  <div style={S.row}><span style={S.rowLabel}>Max consecutive failures</span><span style={S.rowValue}>3</span></div>
                  <div style={S.row}><span style={S.rowLabel}>Cooldown period</span><span style={S.rowValue}>300s</span></div>
                  <div style={{ ...S.row, borderBottom: 'none' }}><span style={S.rowLabel}>Auto-reset</span><span style={{ ...S.rowValue, color: '#4fdbc8' }}>ENABLED</span></div>
                </>
              )
            }
          </div>

          {/* Stat strip */}
          <div style={S.statsRow}>
            {[
              { label: 'Current TPS', value: '1,244.5', color: '#4fdbc8' },
              { label: 'Active Agents', value: '3', color: '#e5e2e1' },
              { label: 'Rejected (24h)', value: '0', color: '#ffb4ab' },
              { label: 'Settlement Time', value: '~400ms', color: '#e5e2e1' },
            ].map((s, i) => (
              <div key={i} style={S.statCard}>
                <p style={S.statLabel}>{s.label}</p>
                <p style={{ ...S.statValue, color: s.color }}>{s.value}</p>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}

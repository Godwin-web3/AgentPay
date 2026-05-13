import { useEffect, useState } from 'react'
import { getPolicy } from '../api'
import type { PolicyData } from '../types'

export default function Policy() {
  const [policy, setPolicy] = useState<PolicyData | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    getPolicy()
      .then(setPolicy)
      .catch(() => setPolicy(null))
      .finally(() => setLoading(false))
  }, [])

  if (loading) return (
    <div className="policy-view">
      <div className="empty-state">
        <div className="icon">⚡</div>
        Loading policy...
      </div>
    </div>
  )

  if (!policy) return (
    <div className="policy-view">
      <div className="empty-state">
        <div className="icon">⚠️</div>
        Could not load policy
      </div>
    </div>
  )

  const spendPct = Math.min((policy.dailySpendSoFar / policy.dailyCap) * 100, 100)
  const isCircuitBroken = policy.circuitBreaker?.paused

  return (
    <div className="policy-view">

      {isCircuitBroken && (
        <div className="alert danger">
          🔴 Circuit breaker active — agent is paused
        </div>
      )}

      <div className="card">
        <div className="section-title">Daily Spend</div>
        <div className="stat-grid">
          <div className="stat">
            <div className="stat-label">Spent Today</div>
            <div className="stat-value coral">{policy.dailySpendSoFar} <span style={{ fontSize: 13, color: 'var(--muted)' }}>STT</span></div>
          </div>
          <div className="stat">
            <div className="stat-label">Daily Cap</div>
            <div className="stat-value">{policy.dailyCap} <span style={{ fontSize: 13, color: 'var(--muted)' }}>STT</span></div>
          </div>
          <div className="stat">
            <div className="stat-label">Remaining</div>
            <div className="stat-value cyan">{policy.dailyRemaining} <span style={{ fontSize: 13, color: 'var(--muted)' }}>STT</span></div>
          </div>
          <div className="stat">
            <div className="stat-label">Per TX Cap</div>
            <div className="stat-value">{policy.perTxCap} <span style={{ fontSize: 13, color: 'var(--muted)' }}>STT</span></div>
          </div>
        </div>
        <div className="progress-bar" style={{ marginTop: 20 }}>
          <div className="progress-fill" style={{ width: spendPct + '%' }} />
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 6 }}>
          <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--muted)' }}>0 STT</span>
          <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--muted)' }}>{spendPct.toFixed(1)}% used</span>
          <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--muted)' }}>{policy.dailyCap} STT</span>
        </div>
      </div>

      <div className="card">
        <div className="section-title">Active Hours</div>
        <div className="stat-grid">
          <div className="stat">
            <div className="stat-label">Start</div>
            <div className="stat-value">{policy.activeHours.start}:00 <span style={{ fontSize: 13, color: 'var(--muted)' }}>UTC</span></div>
          </div>
          <div className="stat">
            <div className="stat-label">End</div>
            <div className="stat-value">{policy.activeHours.end}:00 <span style={{ fontSize: 13, color: 'var(--muted)' }}>UTC</span></div>
          </div>
        </div>
      </div>

      <div className="card">
        <div className="section-title">Circuit Breaker</div>
        <div className="stat-grid">
          <div className="stat">
            <div className="stat-label">Max TX / Hour</div>
            <div className="stat-value">{policy.circuitBreaker.maxTxPerHour}</div>
          </div>
          <div className="stat">
            <div className="stat-label">Max Failures</div>
            <div className="stat-value coral">{policy.circuitBreaker.maxConsecutiveFailures}</div>
          </div>
          <div className="stat">
            <div className="stat-label">Pause Duration</div>
            <div className="stat-value">{policy.circuitBreaker.pauseDurationMinutes} <span style={{ fontSize: 13, color: 'var(--muted)' }}>min</span></div>
          </div>
          <div className="stat">
            <div className="stat-label">Status</div>
            <div className={`stat-value ${isCircuitBroken ? 'coral' : 'cyan'}`}>
              {isCircuitBroken ? 'PAUSED' : 'ACTIVE'}
            </div>
          </div>
        </div>
      </div>

      {policy.whitelist.length > 0 && (
        <div className="card">
          <div className="section-title">Whitelisted Recipients</div>
          {policy.whitelist.map((addr, i) => (
            <div key={i} style={{
              fontFamily: 'var(--font-mono)',
              fontSize: 12,
              color: 'var(--text)',
              padding: '8px 0',
              borderBottom: i < policy.whitelist.length - 1 ? '1px solid var(--border)' : 'none'
            }}>
              {addr}
            </div>
          ))}
        </div>
      )}

    </div>
  )
}

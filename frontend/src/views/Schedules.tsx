import { useEffect, useState } from 'react'
import { getSchedules, getOnChainSchedules, cancelSchedule, cancelOnChainSchedule, getScheduleStats } from '../api'

function formatInterval(seconds: number) {
  if (seconds < 3600) return `${Math.floor(seconds / 60)} minute(s)`
  if (seconds < 86400) return `${Math.floor(seconds / 3600)} hour(s)`
  return `${Math.floor(seconds / 86400)} day(s)`
}

type SourceFilter = 'all' | 'onchain' | 'local'
type StatusFilter = 'all' | 'active' | 'inactive'

export default function Schedules({ userAddress, userId }: { userAddress: string, userId: string }) {
  const [schedules, setSchedules] = useState<any[]>([])
  const [stats, setStats] = useState<Record<string, { success: number; failed: number; lastRun: number }>>({})
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [sourceFilter, setSourceFilter] = useState<SourceFilter>('all')
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('active')

  useEffect(() => {
    fetchSchedules()
  }, [userAddress])

  async function fetchSchedules() {
    if (!userAddress) return
    setLoading(true)
    setError('')
    try {
      let all: any[] = []
      try {
        const res = await getSchedules(userId)
        if (res.schedules) all = [...res.schedules]
      } catch (e) {}

      try {
        const onChain = await getOnChainSchedules(userId)
        onChain.forEach(oc => {
          if (!all.find(a => a.id === oc.id && a.onChain)) {
             all.push({ ...oc, onChain: true })
          }
        })
      } catch (e) {
        console.warn("Failed to fetch on-chain schedules", e)
      }

      setSchedules(all)

      try {
        const s = await getScheduleStats(userId)
        setStats(s)
      } catch (e) {
        console.warn("Failed to fetch schedule stats", e)
      }
    } catch (err) {
      setError('Failed to load schedules')
    } finally {
      setLoading(false)
    }
  }

  async function handleCancel(id: number, onChain: boolean) {
    if (!confirm('Are you sure you want to cancel this automated payment?')) return
    try {
      if (onChain) {
        await cancelOnChainSchedule(id, userId)
        alert('On-chain schedule cancelled!')
      } else {
        await cancelSchedule(id.toString(), userId)
        alert('Local schedule cancelled!')
      }

      setSchedules(schedules.map(s => (s.id === id && s.onChain === onChain) ? { ...s, active: false } : s))
      setTimeout(() => fetchSchedules(), 2000)
    } catch (err: any) {
      alert('Failed to cancel schedule: ' + err.message)
    }
  }

  if (loading && schedules.length === 0) return (
    <div className="view-container">
      <div className="empty-state">Loading schedules...</div>
    </div>
  )

  const filtered = schedules.filter(job => {
    if (sourceFilter === 'onchain' && !job.onChain) return false
    if (sourceFilter === 'local' && job.onChain) return false
    if (statusFilter === 'active' && !job.active) return false
    if (statusFilter === 'inactive' && job.active) return false
    return true
  })

  const chipStyle = (isActive: boolean): React.CSSProperties => ({
    padding: '5px 12px',
    borderRadius: 4,
    fontSize: 10,
    fontFamily: 'var(--font-mono)',
    letterSpacing: 1,
    textTransform: 'uppercase',
    cursor: 'pointer',
    border: `1px solid ${isActive ? 'var(--seal)' : 'var(--border)'}`,
    color: isActive ? 'var(--seal)' : 'var(--muted)',
    background: isActive ? 'rgba(217,164,65,0.08)' : 'transparent',
    whiteSpace: 'nowrap'
  })

  return (
    <div className="view-container" style={{ padding: 20 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
        <h2 style={{ margin: 0 }}>Automated Schedules</h2>
        <button className="send-btn" onClick={fetchSchedules} style={{ width: 'auto', padding: '0 15px' }}>Refresh</button>
      </div>

      <div style={{ display: 'flex', gap: 8, marginBottom: 10, overflowX: 'auto' }}>
        <div onClick={() => setSourceFilter('all')} style={chipStyle(sourceFilter === 'all')}>All Sources</div>
        <div onClick={() => setSourceFilter('onchain')} style={chipStyle(sourceFilter === 'onchain')}>On-Chain</div>
        <div onClick={() => setSourceFilter('local')} style={chipStyle(sourceFilter === 'local')}>Local Agent</div>
      </div>
      <div style={{ display: 'flex', gap: 8, marginBottom: 24, overflowX: 'auto' }}>
        <div onClick={() => setStatusFilter('active')} style={chipStyle(statusFilter === 'active')}>Active</div>
        <div onClick={() => setStatusFilter('inactive')} style={chipStyle(statusFilter === 'inactive')}>Inactive</div>
        <div onClick={() => setStatusFilter('all')} style={chipStyle(statusFilter === 'all')}>All</div>
      </div>

      {error && <div className="alert danger">{error}</div>}

      {filtered.length === 0 ? (
        <div className="card" style={{ textAlign: 'center', padding: '40px 20px' }}>
          <div style={{ fontSize: 40, marginBottom: 16 }}>⏰</div>
          <div style={{ color: 'var(--muted)', marginBottom: 20 }}>
            {schedules.length === 0 ? 'No automated payments found.' : 'No schedules match this filter.'}
          </div>
          {schedules.length === 0 && (
            <p style={{ fontSize: 13, maxWidth: 300, margin: '0 auto' }}>
              You can create schedules by asking the Agent in the Terminal. Try saying:
              <br/><br/>
              <code style={{ background: 'rgba(0,0,0,0.3)', padding: '4px 8px', borderRadius: 4 }}>
                "Pay 0.1 USDC every day"
              </code>
            </p>
          )}
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          {filtered.map((job, _idx) => {
            const jobStats = job.onChain ? stats[job.id?.toString()] : null
            return (
            <div key={`${job.id}-${job.onChain ? 'oc' : 'lc'}`} className={`card ${!job.active ? 'cancelled' : ''}`} style={{ position: 'relative', opacity: job.active ? 1 : 0.6 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 12 }}>
                <div style={{ fontWeight: 600, color: job.active ? 'var(--seal)' : 'var(--muted)' }}>{job.amount} USDC</div>
                <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                  <div style={{
                    fontSize: 10,
                    padding: '2px 6px',
                    borderRadius: 4,
                    background: job.onChain ? 'rgba(91,140,166,0.1)' : 'rgba(255,255,255,0.05)',
                    color: job.onChain ? 'var(--wire)' : 'var(--muted)',
                    border: '1px solid currentColor'
                  }}>
                    {job.onChain ? 'ON-CHAIN' : 'LOCAL AGENT'}
                  </div>
                  <div style={{
                    fontSize: 10,
                    padding: '2px 6px',
                    borderRadius: 4,
                    background: job.active ? 'rgba(217,164,65,0.1)' : 'rgba(255,255,255,0.05)',
                    color: job.active ? 'var(--seal)' : 'var(--muted)',
                    border: '1px solid currentColor'
                  }}>
                    {job.active ? 'ACTIVE' : 'INACTIVE'}
                  </div>
                </div>
              </div>

              <div style={{ marginBottom: 12 }}>
                <div style={{ fontSize: 10, color: 'var(--muted)', textTransform: 'uppercase', marginBottom: 4 }}>Recipient</div>
                <div style={{ fontFamily: 'var(--font-mono)', fontSize: 12 }}>{job.to}</div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 16 }}>
                <div>
                  <div style={{ fontSize: 10, color: 'var(--muted)', textTransform: 'uppercase', marginBottom: 4 }}>Interval</div>
                  <div style={{ fontSize: 13 }}>Every {job.onChain ? formatInterval(job.interval) : (job.intervalLabel || formatInterval(job.interval / 1000))}</div>
                </div>
                <div>
                  <div style={{ fontSize: 10, color: 'var(--muted)', textTransform: 'uppercase', marginBottom: 4 }}>Next Run</div>
                  <div style={{ fontSize: 13 }}>{new Date(job.nextRun).toLocaleString()}</div>
                </div>
              </div>

              {!job.onChain && (
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 16 }}>
                  <div>
                    <div style={{ fontSize: 10, color: 'var(--muted)', textTransform: 'uppercase', marginBottom: 4 }}>Last Run</div>
                    <div style={{ fontSize: 13 }}>{job.lastRun ? new Date(job.lastRun).toLocaleString() : 'Never'}</div>
                  </div>
                  <div>
                    <div style={{ fontSize: 10, color: 'var(--muted)', textTransform: 'uppercase', marginBottom: 4 }}>Total Runs</div>
                    <div style={{ fontSize: 13 }}>{job.totalRuns || 0}</div>
                  </div>
                </div>
              )}

              {job.onChain && (
                <div style={{ display: 'flex', gap: 16, marginBottom: 16, padding: '10px 12px', background: 'rgba(255,255,255,0.02)', borderRadius: 4, border: '1px solid var(--border)' }}>
                  <div>
                    <div style={{ fontSize: 10, color: 'var(--muted)', textTransform: 'uppercase', marginBottom: 4 }}>Succeeded</div>
                    <div style={{ fontSize: 15, fontFamily: 'var(--font-mono)', color: 'var(--seal)', fontWeight: 700 }}>{jobStats?.success ?? 0}</div>
                  </div>
                  <div>
                    <div style={{ fontSize: 10, color: 'var(--muted)', textTransform: 'uppercase', marginBottom: 4 }}>Failed</div>
                    <div style={{ fontSize: 15, fontFamily: 'var(--font-mono)', color: jobStats?.failed ? 'var(--danger)' : 'var(--muted)', fontWeight: 700 }}>{jobStats?.failed ?? 0}</div>
                  </div>
                  <div>
                    <div style={{ fontSize: 10, color: 'var(--muted)', textTransform: 'uppercase', marginBottom: 4 }}>Last Run</div>
                    <div style={{ fontSize: 12, fontFamily: 'var(--font-mono)' }}>{jobStats?.lastRun ? new Date(jobStats.lastRun).toLocaleTimeString() : 'Never'}</div>
                  </div>
                </div>
              )}

              {job.minBalance > 0 && (
                <div style={{ marginBottom: 16, fontSize: 12, color: 'var(--wire)' }}>
                  <span style={{ color: 'var(--muted)', textTransform: 'uppercase', fontSize: 10 }}>Condition:</span> Bal {'>'} {job.minBalance} USDC
                </div>
              )}

              {job.reason && (
                <div style={{ marginBottom: 16, padding: '8px 12px', background: 'rgba(255,255,255,0.03)', borderRadius: 4, fontSize: 12, border: '1px solid var(--border)' }}>
                  "{job.reason}"
                </div>
              )}

              {job.active && (
                <div style={{ display: 'flex', gap: 10 }}>
                  <button
                    onClick={() => handleCancel(job.id, job.onChain)}
                    style={{
                      flex: 1,
                      background: 'rgba(196,87,63,0.1)',
                      color: 'var(--danger)',
                      border: '1px solid var(--danger)',
                      padding: '8px',
                      borderRadius: 4,
                      cursor: 'pointer',
                      fontSize: 12,
                      fontFamily: 'var(--font-mono)'
                    }}
                  >
                    CANCEL SCHEDULE
                  </button>
                </div>
              )}
            </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

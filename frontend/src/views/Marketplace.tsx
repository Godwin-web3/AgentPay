import { useEffect, useState } from 'react'
import { getMarketJobs } from '../api'

export default function Marketplace({ userId }: { userAddress: string, userId: string }) {
  const [market, setMarket] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    fetchMarket()
  }, [userId])

  async function fetchMarket() {
    setLoading(true)
    setError('')
    try {
      const res = await getMarketJobs(userId || 'demo'); console.log('Market data:', res);
      if (!res?.market) throw new Error('Invalid market data received');
      setMarket({ ...res.market, recentJobs: res.recentJobs || [] })
    } catch (err: any) {
      setError(err?.message || 'Failed to load market data. Check connection or try again.')
    } finally {
      setLoading(false)
    }
  }

  if (loading) return (
    <div className="view-container">
      <div className="empty-state">Loading market...</div>
    </div>
  )

  const jobs = market?.recentJobs || []

  return (
    <div className="view-container" style={{ padding: 20 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
        <h2 style={{ margin: 0 }}>Job Marketplace</h2>
        <button className="send-btn" onClick={fetchMarket} style={{ width: 'auto', padding: '0 15px' }}>Refresh</button>
      </div>

      {error && <div className="alert danger">{error}</div>}

      {market && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12, marginBottom: 24 }}>
          <div className="card" style={{ padding: 12, textAlign: 'center' }}>
            <div style={{ fontSize: 10, color: 'var(--muted)', textTransform: 'uppercase', marginBottom: 4 }}>Total Jobs</div>
            <div style={{ fontSize: 20, fontWeight: 600, color: 'var(--cyan)' }}>{market.totalJobs}</div>
          </div>
          <div className="card" style={{ padding: 12, textAlign: 'center' }}>
            <div style={{ fontSize: 10, color: 'var(--muted)', textTransform: 'uppercase', marginBottom: 4 }}>Avg Budget</div>
            <div style={{ fontSize: 20, fontWeight: 600, color: 'var(--cyan)' }}>{market.averageBudget}</div>
          </div>
          <div className="card" style={{ padding: 12, textAlign: 'center' }}>
            <div style={{ fontSize: 10, color: 'var(--muted)', textTransform: 'uppercase', marginBottom: 4 }}>Volume</div>
            <div style={{ fontSize: 20, fontWeight: 600, color: 'var(--cyan)' }}>{market.totalVolumeUSDC} USDC</div>
          </div>
        </div>
      )}

      {jobs.length === 0 ? (
        <div className="card" style={{ textAlign: 'center', padding: '40px 20px' }}>
          <div style={{ color: 'var(--muted)' }}>No open jobs right now.</div>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          {jobs.map((job: any) => (
            <div key={job.id} className="card">
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 12 }}>
                <div style={{ fontWeight: 600, color: 'var(--cyan)' }}>{job.budget} USDC</div>
                <div style={{
                  fontSize: 10,
                  padding: '2px 6px',
                  borderRadius: 4,
                  background: job.status === 'Open' ? 'rgba(0,255,255,0.1)' : 'rgba(255,255,255,0.05)',
                  color: job.status === 'Open' ? 'var(--cyan)' : 'var(--muted)',
                  border: '1px solid currentColor'
                }}>
                  {job.status?.toUpperCase()}
                </div>
              </div>

              <div style={{ marginBottom: 12 }}>
                <div style={{ fontSize: 10, color: 'var(--muted)', textTransform: 'uppercase', marginBottom: 4 }}>Description</div>
                <div style={{ fontSize: 13 }}>{job.description}</div>
              </div>

              <div style={{ marginBottom: 12 }}>
                <div style={{ fontSize: 10, color: 'var(--muted)', textTransform: 'uppercase', marginBottom: 4 }}>Provider</div>
                <div style={{ fontFamily: 'var(--font-mono)', fontSize: 12 }}>{job.provider}</div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

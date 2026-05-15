import { useEffect, useState } from 'react'
import { getSchedules, cancelSchedule } from '../api'

export default function Schedules({ userAddress }: { userAddress: string }) {
  const [schedules, setSchedules] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    fetchSchedules()
  }, [userAddress])

  async function fetchSchedules() {
    if (!userAddress) return
    setLoading(true)
    try {
      const res = await getSchedules(userAddress)
      setSchedules(res.schedules)
    } catch (err) {
      setError('Failed to load schedules')
    } finally {
      setLoading(false)
    }
  }

  async function handleCancel(id: string) {
    if (!confirm('Are you sure you want to cancel this automated payment?')) return
    try {
      await cancelSchedule(id, userAddress)
      setSchedules(schedules.filter(s => s.id !== id))
    } catch (err) {
      alert('Failed to cancel schedule')
    }
  }

  if (loading) return (
    <div className="view-container">
      <div className="empty-state">Loading schedules...</div>
    </div>
  )

  return (
    <div className="view-container" style={{ padding: 20 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
        <h2 style={{ margin: 0 }}>Automated Schedules</h2>
        <button className="send-btn" onClick={fetchSchedules} style={{ width: 'auto', padding: '0 15px' }}>Refresh</button>
      </div>

      {error && <div className="alert danger">{error}</div>}

      {schedules.length === 0 ? (
        <div className="card" style={{ textAlign: 'center', padding: '40px 20px' }}>
          <div style={{ fontSize: 40, marginBottom: 16 }}>⏰</div>
          <div style={{ color: 'var(--muted)', marginBottom: 20 }}>No automated payments scheduled.</div>
          <p style={{ fontSize: 13, maxWidth: 300, margin: '0 auto' }}>
            You can create schedules by asking the Agent in the Terminal. Try saying:
            <br/><br/>
            <code style={{ background: 'rgba(0,0,0,0.3)', padding: '4px 8px', borderRadius: 4 }}>
              "Pay 0.1 STT to 0x... every day"
            </code>
          </p>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          {schedules.map(job => (
            <div key={job.id} className="card" style={{ position: 'relative' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 12 }}>
                <div style={{ fontWeight: 600, color: 'var(--cyan)' }}>{job.amount} STT</div>
                <div style={{ fontSize: 10, color: 'var(--muted)', fontFamily: 'var(--font-mono)' }}>{job.id}</div>
              </div>
              
              <div style={{ marginBottom: 12 }}>
                <div style={{ fontSize: 10, color: 'var(--muted)', textTransform: 'uppercase', marginBottom: 4 }}>Recipient</div>
                <div style={{ fontFamily: 'var(--font-mono)', fontSize: 12 }}>{job.to}</div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 16 }}>
                <div>
                  <div style={{ fontSize: 10, color: 'var(--muted)', textTransform: 'uppercase', marginBottom: 4 }}>Interval</div>
                  <div style={{ fontSize: 13 }}>Every {job.interval}</div>
                </div>
                <div>
                  <div style={{ fontSize: 10, color: 'var(--muted)', textTransform: 'uppercase', marginBottom: 4 }}>Next Run</div>
                  <div style={{ fontSize: 13 }}>{new Date(job.nextRun).toLocaleString()}</div>
                </div>
              </div>

              {job.reason && (
                <div style={{ marginBottom: 16, padding: '8px 12px', background: 'rgba(255,255,255,0.03)', borderRadius: 4, fontSize: 12, border: '1px solid var(--border)' }}>
                  "{job.reason}"
                </div>
              )}

              <div style={{ display: 'flex', gap: 10 }}>
                <button 
                  onClick={() => handleCancel(job.id)}
                  style={{ 
                    flex: 1, 
                    background: 'rgba(255,100,100,0.1)', 
                    color: 'var(--coral)', 
                    border: '1px solid var(--coral)',
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
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

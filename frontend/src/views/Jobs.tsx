import { useEffect, useState } from 'react'
import { getMyJobs } from '../api'

export default function Jobs({ userAddress, userId }: { userAddress: string, userId: string }) {
  const [jobs, setJobs] = useState<{ created: any[]; hired: any[] }>({ created: [], hired: [] })
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    fetchJobs()
  }, [userAddress])

  async function fetchJobs() {
    setLoading(true)
    setError('')
    try {
      const res = await getMyJobs(userId)
      setJobs(res)
    } catch (err) {
      setError('Failed to load jobs')
    } finally {
      setLoading(false)
    }
  }

  if (loading && jobs.created.length === 0 && jobs.hired.length === 0) return (
    <div className="view-container">
      <div className="empty-state">Loading jobs...</div>
    </div>
  )

  function JobCard({ job, role }: { job: any, role: string }) {
    return (
      <div className="card">
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 12 }}>
          <div style={{ fontWeight: 600, color: 'var(--cyan)' }}>{job.budget} USDC</div>
          <div style={{ display: 'flex', gap: 8 }}>
            <div style={{
              fontSize: 10,
              padding: '2px 6px',
              borderRadius: 4,
              background: 'rgba(255,255,255,0.05)',
              color: 'var(--muted)',
              border: '1px solid currentColor'
            }}>
              {role.toUpperCase()}
            </div>
            <div style={{
              fontSize: 10,
              padding: '2px 6px',
              borderRadius: 4,
              background: job.status === 'Open' || job.status === 'Funded' ? 'rgba(0,255,255,0.1)' : 'rgba(255,255,255,0.05)',
              color: job.status === 'Open' || job.status === 'Funded' ? 'var(--cyan)' : 'var(--muted)',
              border: '1px solid currentColor'
            }}>
              {job.status?.toUpperCase()}
            </div>
          </div>
        </div>

        <div style={{ marginBottom: 12 }}>
          <div style={{ fontSize: 10, color: 'var(--muted)', textTransform: 'uppercase', marginBottom: 4 }}>Description</div>
          <div style={{ fontSize: 13 }}>{job.description}</div>
        </div>

        <div style={{ marginBottom: 12 }}>
          <div style={{ fontSize: 10, color: 'var(--muted)', textTransform: 'uppercase', marginBottom: 4 }}>
            {role === 'client' ? 'Provider' : 'Client'}
          </div>
          <div style={{ fontFamily: 'var(--font-mono)', fontSize: 12 }}>
            {role === 'client' ? job.provider : job.client}
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="view-container" style={{ padding: 20 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
        <h2 style={{ margin: 0 }}>My Jobs</h2>
        <button className="send-btn" onClick={fetchJobs} style={{ width: 'auto', padding: '0 15px' }}>Refresh</button>
      </div>

      {error && <div className="alert danger">{error}</div>}

      <div style={{ marginBottom: 12, fontSize: 12, color: 'var(--muted)', textTransform: 'uppercase' }}>
        Created by you
      </div>
      {jobs.created.length === 0 ? (
        <div className="card" style={{ textAlign: 'center', padding: '30px 20px', marginBottom: 24 }}>
          <div style={{ color: 'var(--muted)' }}>No jobs created yet. Hire someone from the Marketplace.</div>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16, marginBottom: 24 }}>
          {jobs.created.map((job: any) => (
            <JobCard key={job.jobId} job={job} role="client" />
          ))}
        </div>
      )}

      <div style={{ marginBottom: 12, fontSize: 12, color: 'var(--muted)', textTransform: 'uppercase' }}>
        Hired for
      </div>
      {jobs.hired.length === 0 ? (
        <div className="card" style={{ textAlign: 'center', padding: '30px 20px' }}>
          <div style={{ color: 'var(--muted)' }}>No jobs where you've been hired yet.</div>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          {jobs.hired.map((job: any) => (
            <JobCard key={job.id} job={job} role="provider" />
          ))}
        </div>
      )}
    </div>
  )
}

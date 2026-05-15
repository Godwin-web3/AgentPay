import { useEffect, useState } from 'react'
import { getPolicy } from '../api'
import type { PolicyData } from '../types'

export default function Policy({ userAddress }: { userAddress: string }) {
  const [policy, setPolicy] = useState<PolicyData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)
  const [isEditing, setIsEditing] = useState(false)
  const [saving, setSaving] = useState(false)

  // Form state
  const [dailyCap, setDailyCap] = useState('')
  const [perTxCap, setPerTxCap] = useState('')
  const [whitelist, setWhitelist] = useState<string[]>([])
  const [newAddr, setNewAddr] = useState('')

  useEffect(() => {
    fetchPolicy()
  }, [userAddress])

  async function fetchPolicy() {
    if (!userAddress) return
    setLoading(true)
    setError(null)
    try {
      const data = await getPolicy(userAddress)
      setPolicy(data)
      setDailyCap(data.dailyCap.toString())
      setPerTxCap(data.perTxCap.toString())
      setWhitelist(data.whitelist)
    } catch (err: any) {
      setError(err.message || 'Failed to fetch policy')
    } finally {
      setLoading(false)
    }
  }

  async function handleSave() {
    if (!userAddress) return
    setSaving(true)
    setError(null)
    setSuccess(null)
    try {
      const selector = '30edc0f5'
      const pTx = BigInt(Math.floor(parseFloat(perTxCap) * 1e18)).toString(16).padStart(64, '0')
      const dCap = BigInt(Math.floor(parseFloat(dailyCap) * 1e18)).toString(16).padStart(64, '0')
      const maxH = BigInt(policy?.circuitBreaker.maxTxPerHour || 10).toString(16).padStart(64, '0')
      const offset = (32 * 4).toString(16).padStart(64, '0') 
      const length = whitelist.length.toString(16).padStart(64, '0')
      let arrayData = ''
      for (const addr of whitelist) {
        arrayData += addr.replace('0x', '').toLowerCase().padStart(64, '0')
      }
      const data = '0x' + selector + pTx + dCap + maxH + offset + length + arrayData

      const txHash = await window.ethereum.request({
        method: 'eth_sendTransaction',
        params: [{
          from: userAddress,
          to: '0x7E5235C0c711Cf2CA57a18d7BFD79a8cd453793D',
          data
        }]
      })
      setSuccess('Transaction submitted: ' + txHash)
      setIsEditing(false)
    } catch (err: any) {
      setError(err.message || 'Failed to update policy')
    } finally {
      setSaving(false)
    }
  }

  function addAddress() {
    if (newAddr && !whitelist.includes(newAddr)) {
      setWhitelist([...whitelist, newAddr])
      setNewAddr('')
    }
  }

  function removeAddress(addr: string) {
    setWhitelist(whitelist.filter(a => a !== addr))
  }

  if (loading) return (
    <div className="policy-view">
      <div className="empty-state">
        <div className="icon">⚡</div>
        Loading policy...
      </div>
    </div>
  )

  if (error || !policy) return (
    <div className="policy-view">
      <div className="empty-state">
        <div className="icon">⚠️</div>
        {error || 'No policy found'}
        <button className="send-btn" onClick={fetchPolicy} style={{ marginTop: 20 }}>Retry</button>
      </div>
    </div>
  )

  const isCircuitBroken = policy.circuitBreaker.paused

  return (
    <div className="policy-view">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
        <h2 style={{ margin: 0 }}>Policy Settings</h2>
        {!isEditing ? (
          <div style={{ display: 'flex', gap: 10 }}>
            <button className="send-btn" onClick={() => setIsEditing(true)}>
              Edit Policy
            </button>
          </div>
        ) : (
          <div style={{ display: 'flex', gap: 10 }}>
            <button className="send-btn" onClick={() => setIsEditing(false)} style={{ background: 'var(--muted)' }}>
              Cancel
            </button>
            <button className="send-btn" onClick={handleSave} disabled={saving} style={{ background: 'var(--cyan)', color: 'black' }}>
              {saving ? 'Confirming...' : 'Save to Blockchain'}
            </button>
          </div>
        )}
      </div>

      {success && <div className="alert success" style={{ marginBottom: 20 }}>{success}</div>}
      {error && <div className="alert danger" style={{ marginBottom: 20 }}>{error}</div>}

      <div className="card">
        <div className="section-title">Spending Limits</div>
        <div className="stat-grid">
          <div className="stat">
            <div className="stat-label">Daily Cap</div>
            {!isEditing ? (
              <div className="stat-value cyan">{policy.dailyCap} <span style={{ fontSize: 12 }}>STT</span></div>
            ) : (
              <input 
                type="number" 
                className="chat-input" 
                style={{ background: 'var(--bg)', borderBottom: '1px solid var(--border)', width: '100%' }}
                value={dailyCap}
                onChange={e => setDailyCap(e.target.value)}
              />
            )}
          </div>
          <div className="stat">
            <div className="stat-label">Per-TX Cap</div>
            {!isEditing ? (
              <div className="stat-value cyan">{policy.perTxCap} <span style={{ fontSize: 12 }}>STT</span></div>
            ) : (
              <input 
                type="number" 
                className="chat-input" 
                style={{ background: 'var(--bg)', borderBottom: '1px solid var(--border)', width: '100%' }}
                value={perTxCap}
                onChange={e => setPerTxCap(e.target.value)}
              />
            )}
          </div>
        </div>
      </div>

      <div className="card">
        <div className="section-title">Usage Stats</div>
        <div style={{ marginBottom: 15 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8, fontSize: 12 }}>
            <span style={{ color: 'var(--muted)' }}>Daily Allowance Spent</span>
            <span>{policy.dailySpendSoFar} / {policy.dailyCap} STT</span>
          </div>
          <div className="progress-bar">
            <div 
              className="progress-fill" 
              style={{ width: `${Math.min(100, (policy.dailySpendSoFar / policy.dailyCap) * 100)}%` }} 
            />
          </div>
        </div>
      </div>

      <div className="card">
        <div className="section-title">Whitelisted Recipients</div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {whitelist.length === 0 && <div style={{ fontSize: 12, color: 'var(--muted)' }}>No whitelisted addresses.</div>}
          {whitelist.map(addr => (
            <div key={addr} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 12px', background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 4 }}>
              <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11 }}>{addr}</span>
              {isEditing && (
                <button onClick={() => removeAddress(addr)} style={{ background: 'none', border: 'none', color: 'var(--danger)', cursor: 'pointer' }}>✕</button>
              )}
            </div>
          ))}
          {isEditing && (
            <div style={{ display: 'flex', gap: 10, marginTop: 10 }}>
              <input 
                type="text" 
                className="chat-input" 
                style={{ background: 'var(--bg)', borderBottom: '1px solid var(--border)', flex: 1 }}
                placeholder="0x..."
                value={newAddr}
                onChange={e => setNewAddr(e.target.value)}
              />
              <button className="send-btn" onClick={addAddress} style={{ padding: '4px 12px', fontSize: 11 }}>Add</button>
            </div>
          )}
        </div>
      </div>

      <div className="card">
        <div className="section-title">Circuit Breaker (Read Only)</div>
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
            <div className="stat-value">{policy.circuitBreaker.pauseDurationMinutes} min</div>
          </div>
          <div className="stat">
            <div className="stat-label">Status</div>
            <div className={`stat-value ${isCircuitBroken ? 'coral' : 'cyan'}`}>
              {isCircuitBroken ? 'PAUSED' : 'ACTIVE'}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

import { useEffect, useState } from 'react'
import { getPolicy, updatePolicy } from '../api'
import type { PolicyData } from '../types'

export default function Policy({ userAddress }: { userAddress: string }) {
  const [policy, setPolicy] = useState<PolicyData | null>(null)
  const [loading, setLoading] = useState(true)
  const [isEditing, setIsEditing] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)

  // Form state
  const [dailyCap, setDailyCap] = useState('')
  const [perTxCap, setPerTxCap] = useState('')
  const [hourStart, setHourStart] = useState('')
  const [hourEnd, setHourEnd] = useState('')
  const [whitelist, setWhitelist] = useState<string[]>([])
  const [newAddr, setNewAddr] = useState('')

  useEffect(() => {
    fetchPolicy()
  }, [])

  async function fetchPolicy() {
    setLoading(true)
    try {
      const data = await getPolicy(userAddress)
      setPolicy(data)
      setDailyCap(data.dailyCap.toString())
      setPerTxCap(data.perTxCap.toString())
      setHourStart(data.activeHours.start.toString())
      setHourEnd(data.activeHours.end.toString())
      setWhitelist(data.whitelist)
    } catch (err) {
      setPolicy(null)
    } finally {
      setLoading(false)
    }
  }

  async function handleSave() {
    setSaving(true)
    setError(null)
    setSuccess(null)
    try {
      await updatePolicy({
        dailyCap: parseFloat(dailyCap),
        perTxCap: parseFloat(perTxCap),
        activeHours: {
          start: parseInt(hourStart),
          end: parseInt(hourEnd)
        },
        whitelist: whitelist
      }, userAddress)
      setSuccess('Policy updated successfully')
      setIsEditing(false)
      fetchPolicy()
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

  const [syncing, setSyncing] = useState(false)

  async function syncToChain() {
    if (!policy || !userAddress) return
    setSyncing(true)
    setError(null)
    setSuccess(null)
    try {
      // setPolicy(uint256 perTxCap, uint256 dailyCap, uint256 maxTxPerHour, address[] whitelist)
      // selector: 0x30edc0f5
      const selector = '30edc0f5'
      const perTxCapHex = BigInt(Math.floor(policy.perTxCap * 1e18)).toString(16).padStart(64, '0')
      const dailyCapHex = BigInt(Math.floor(policy.dailyCap * 1e18)).toString(16).padStart(64, '0')
      const maxTxPerHourHex = BigInt(policy.circuitBreaker.maxTxPerHour).toString(16).padStart(64, '0')
      
      // Encoding array is complex without a library, so we'll use a simplified approach 
      // or just direct the user to the contract if it's too risky.
      // Actually, let's try to encode the basics.
      
      const offset = (32 * 4).toString(16).padStart(64, '0') // 4 static params before array
      const length = policy.whitelist.length.toString(16).padStart(64, '0')
      let arrayData = ''
      for (const addr of policy.whitelist) {
        arrayData += addr.replace('0x', '').toLowerCase().padStart(64, '0')
      }

      const data = '0x' + selector + perTxCapHex + dailyCapHex + maxTxPerHourHex + offset + length + arrayData

      const txHash = await window.ethereum.request({
        method: 'eth_sendTransaction',
        params: [{
          from: userAddress,
          to: '0x7E5235C0c711Cf2CA57a18d7BFD79a8cd453793D',
          data
        }]
      })
      setSuccess('Policy sync transaction sent: ' + txHash)
    } catch (err: any) {
      setError('Sync failed: ' + err.message)
    } finally {
      setSyncing(false)
    }
  }

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
      <div style={{ marginBottom: 20 }}>
        <div style={{ fontSize: 10, color: 'var(--muted)', marginBottom: 4, fontFamily: 'var(--font-mono)' }}>VAULT OWNER</div>
        <div style={{ fontSize: 12, color: 'var(--blue)', fontFamily: 'var(--font-mono)' }}>{userAddress || 'Not Connected'}</div>
      </div>

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
        <h2 style={{ margin: 0 }}>Policy Settings</h2>
        {!isEditing ? (
          <div style={{ display: 'flex', gap: 10 }}>
            <button className="send-btn" onClick={syncToChain} disabled={syncing} style={{ background: 'var(--cyan)', color: 'black' }}>
              {syncing ? 'Syncing...' : 'Sync to Blockchain'}
            </button>
            <button className="send-btn" onClick={() => setIsEditing(true)}>
              Edit Policy
            </button>
          </div>
        ) : (
          <div style={{ display: 'flex', gap: 10 }}>
            <button className="send-btn" onClick={() => setIsEditing(false)} style={{ background: 'var(--muted)' }}>
              Cancel
            </button>
            <button className="send-btn" onClick={handleSave} disabled={saving}>
              {saving ? 'Saving...' : 'Save Changes'}
            </button>
          </div>
        )}
      </div>

      {success && <div className="alert success" style={{ marginBottom: 20 }}>{success}</div>}
      {error && <div className="alert danger" style={{ marginBottom: 20 }}>{error}</div>}
      {isCircuitBroken && (
        <div className="alert danger" style={{ marginBottom: 20 }}>
          🔴 Circuit breaker active — agent is paused
        </div>
      )}

      <div className="card">
        <div className="section-title">Spending Limits</div>
        <div className="stat-grid">
          <div className="stat">
            <div className="stat-label">Daily Cap (STT)</div>
            {isEditing ? (
              <input 
                type="number" 
                value={dailyCap} 
                onChange={e => setDailyCap(e.target.value)}
                style={{ background: 'var(--bg)', border: '1px solid var(--border)', color: 'var(--text)', padding: 5, borderRadius: 4, width: '100%' }}
              />
            ) : (
              <div className="stat-value">{policy.dailyCap}</div>
            )}
          </div>
          <div className="stat">
            <div className="stat-label">Per TX Cap (STT)</div>
            {isEditing ? (
              <input 
                type="number" 
                value={perTxCap} 
                onChange={e => setPerTxCap(e.target.value)}
                style={{ background: 'var(--bg)', border: '1px solid var(--border)', color: 'var(--text)', padding: 5, borderRadius: 4, width: '100%' }}
              />
            ) : (
              <div className="stat-value">{policy.perTxCap}</div>
            )}
          </div>
          <div className="stat">
            <div className="stat-label">Spent Today</div>
            <div className="stat-value coral">{policy.dailySpendSoFar}</div>
          </div>
          <div className="stat">
            <div className="stat-label">Remaining</div>
            <div className="stat-value cyan">{policy.dailyRemaining}</div>
          </div>
        </div>
        {!isEditing && (
          <>
            <div className="progress-bar" style={{ marginTop: 20 }}>
              <div className="progress-fill" style={{ width: spendPct + '%' }} />
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 6 }}>
              <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--muted)' }}>0 STT</span>
              <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--muted)' }}>{spendPct.toFixed(1)}% used</span>
              <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--muted)' }}>{policy.dailyCap} STT</span>
            </div>
          </>
        )}
      </div>

      <div className="card">
        <div className="section-title">Active Hours (UTC)</div>
        <div className="stat-grid">
          <div className="stat">
            <div className="stat-label">Start Hour (0-23)</div>
            {isEditing ? (
              <input 
                type="number" 
                min="0" max="23"
                value={hourStart} 
                onChange={e => setHourStart(e.target.value)}
                style={{ background: 'var(--bg)', border: '1px solid var(--border)', color: 'var(--text)', padding: 5, borderRadius: 4, width: '100%' }}
              />
            ) : (
              <div className="stat-value">{policy.activeHours.start}:00</div>
            )}
          </div>
          <div className="stat">
            <div className="stat-label">End Hour (0-23)</div>
            {isEditing ? (
              <input 
                type="number" 
                min="0" max="23"
                value={hourEnd} 
                onChange={e => setHourEnd(e.target.value)}
                style={{ background: 'var(--bg)', border: '1px solid var(--border)', color: 'var(--text)', padding: 5, borderRadius: 4, width: '100%' }}
              />
            ) : (
              <div className="stat-value">{policy.activeHours.end}:00</div>
            )}
          </div>
        </div>
      </div>

      <div className="card">
        <div className="section-title">Recipient Whitelist</div>
        {isEditing && (
          <div style={{ display: 'flex', gap: 10, marginBottom: 15 }}>
            <input 
              type="text" 
              placeholder="0x..."
              value={newAddr} 
              onChange={e => setNewAddr(e.target.value)}
              style={{ background: 'var(--bg)', border: '1px solid var(--border)', color: 'var(--text)', padding: '5px 10px', borderRadius: 4, flex: 1, fontFamily: 'var(--font-mono)' }}
            />
            <button className="send-btn" onClick={addAddress} style={{ width: 'auto', padding: '0 15px' }}>Add</button>
          </div>
        )}
        
        {whitelist.length === 0 ? (
          <div style={{ color: 'var(--muted)', fontSize: 12 }}>No restrictions (all recipients allowed)</div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {whitelist.map((addr, i) => (
              <div key={i} style={{
                fontFamily: 'var(--font-mono)',
                fontSize: 12,
                color: 'var(--text)',
                padding: '10px',
                background: 'rgba(255,255,255,0.03)',
                borderRadius: 4,
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                border: '1px solid var(--border)'
              }}>
                <span>{addr}</span>
                {isEditing && (
                  <button 
                    onClick={() => removeAddress(addr)}
                    style={{ background: 'none', border: 'none', color: 'var(--coral)', cursor: 'pointer', fontSize: 16 }}
                  >
                    ×
                  </button>
                )}
              </div>
            ))}
          </div>
        )}
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

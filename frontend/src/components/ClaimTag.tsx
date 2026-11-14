import { useState } from 'react'
import { claimTag } from '../api'
import { useAuth } from '../contexts/AuthContext'

export default function ClaimTag({ onClaimed }: { onClaimed: (tag: string) => void }) {
  const { user } = useAuth()
  const [tag, setTag] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const ready = tag.length >= 3 && !loading

  const handleClaim = async () => {
    if (!tag || !user) return
    setLoading(true)
    setError('')
    try {
      const res = await claimTag(tag, user.uid)
      onClaimed(res.tag)
    } catch (err: any) {
      setError(err.message || 'Failed to claim tag')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="sheet">
      <header className="sheet-bar">
        <span className="mark">AgentPay</span>
        <span className="kicker" style={{ margin: 0 }}>Tag</span>
      </header>
      <main className="sheet-main">
        <h1 className="display display-tight">
          Claim a tag.
          <span className="display-em">Optional.</span>
        </h1>
        <p className="lede">This is how people find you. You can skip it.</p>
        <label className="rule-field">
          <span className="chain-name">@</span>
          <input
            value={tag}
            onChange={e => setTag(e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, ''))}
            placeholder="yourtag"
            maxLength={20}
            aria-label="Tag"
            autoCapitalize="none"
            autoCorrect="off"
            spellCheck={false}
          />
        </label>
        {error && <p className="fine" style={{ color: '#8d3b2c' }}>{error}</p>}
        <div className="stack-actions">
          <button type="button" onClick={handleClaim} disabled={!ready} className="ink-btn">
            {loading ? 'Claiming' : 'Claim @' + (tag || 'yourtag')}
          </button>
          <button type="button" onClick={() => onClaimed('')} className="text-link">
            Skip for now
          </button>
        </div>
      </main>
    </div>
  )
}

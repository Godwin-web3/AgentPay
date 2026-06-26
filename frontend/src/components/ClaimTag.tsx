import { useState } from 'react'
import { claimTag } from '../api'
import { useAuth } from '../contexts/AuthContext'

export default function ClaimTag({ onClaimed }: { onClaimed: (tag: string) => void }) {
  const { user } = useAuth()
  const [tag, setTag] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

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
    <div style={{
      minHeight: '100vh',
      background: '#0A0A0A',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      padding: '24px',
      gap: '32px'
    }}>
      <div style={{ textAlign: 'center' }}>
        <div style={{ fontSize: '48px', marginBottom: '8px' }}>⚡</div>
        <h1 style={{ color: '#4fdbc8', fontSize: '24px', fontWeight: 700, margin: 0 }}>Claim your tag</h1>
        <p style={{ color: '#666', marginTop: '8px', fontSize: '13px' }}>
          People can send you USDC using @yourtag
        </p>
      </div>

      <div style={{
        background: '#141414',
        border: '1px solid #222',
        borderRadius: '4px',
        padding: '32px',
        width: '100%',
        maxWidth: '360px',
        display: 'flex',
        flexDirection: 'column',
        gap: '16px'
      }}>
        <div style={{
          display: 'flex',
          alignItems: 'center',
          border: '1px solid #333',
          background: '#0A0A0A',
          padding: '12px',
          gap: '4px'
        }}>
          <span style={{ color: '#4fdbc8', fontFamily: 'monospace', fontSize: '16px' }}>@</span>
          <input
            value={tag}
            onChange={e => setTag(e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, ''))}
            placeholder="yourtag"
            maxLength={20}
            style={{
              flex: 1,
              background: 'transparent',
              border: 'none',
              outline: 'none',
              color: '#fff',
              fontSize: '16px',
              fontFamily: 'monospace'
            }}
          />
        </div>

        {error && <p style={{ color: '#ff4444', fontSize: '12px', margin: 0 }}>{error}</p>}

        <button
          onClick={handleClaim}
          disabled={loading || tag.length < 3}
          style={{
            background: tag.length >= 3 ? '#4fdbc8' : '#1a1a1a',
            color: tag.length >= 3 ? '#0A0A0A' : '#444',
            border: 'none',
            borderRadius: '4px',
            padding: '14px',
            fontSize: '15px',
            fontWeight: 700,
            cursor: tag.length >= 3 ? 'pointer' : 'not-allowed',
          }}
        >
          {loading ? 'Claiming...' : 'Claim @' + (tag || 'yourtag')}
        </button>

        <button
          onClick={() => onClaimed('')}
          style={{
            background: 'transparent',
            border: 'none',
            color: '#444',
            fontSize: '12px',
            cursor: 'pointer',
            padding: '4px'
          }}
        >
          Skip for now
        </button>
      </div>
    </div>
  )
}

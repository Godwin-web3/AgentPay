import { useState } from 'react'
import { claimTestnet } from '../api'

export default function ClaimFunds({ userId, onDone }: { userId: string; onDone: () => void }) {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [landed, setLanded] = useState<string[] | null>(null)
  const [skipped, setSkipped] = useState<string[]>([])

  async function claim() {
    setLoading(true)
    setError('')
    try {
      const result = await claimTestnet(userId)
      if (!result.success) {
        setError(result.reason || 'Nothing was claimed.')
        return
      }
      setLanded(result.landed || [])
      setSkipped(result.skipped || [])
    } catch (err: any) {
      setError(err.message || 'Nothing was claimed.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div style={{ minHeight: '100dvh', background: '#f3f0e8', color: '#161513', display: 'flex', flexDirection: 'column', padding: '28px 22px' }}>
      <span style={{ fontFamily: 'var(--font-head)', fontSize: 18 }}>AgentPay</span>
      <div style={{ marginTop: 'auto', maxWidth: 520 }}>
        <h1 style={{ fontFamily: 'var(--font-head)', fontWeight: 500, fontSize: 56, lineHeight: 0.9, letterSpacing: '-0.04em', margin: '0 0 16px' }}>
          Claim the testnet.
        </h1>
        {!landed ? (
          <>
            <p style={{ margin: 0, fontSize: 17, lineHeight: 1.4, maxWidth: '34ch' }}>
              One tap sends test USDG, the stock tokens, and gas to your wallet.
            </p>
            {error && <p style={{ color: '#8a3b2c', marginTop: 16 }}>{error}</p>}
            <button type="button" onClick={claim} disabled={loading} style={{ marginTop: 28, background: '#161513', color: '#f3f0e8', border: 'none', padding: '14px 22px', fontFamily: 'var(--font-head)', fontSize: 16, cursor: 'pointer' }}>
              {loading ? 'Claiming' : 'Claim test funds'}
            </button>
          </>
        ) : (
          <>
            <ul style={{ margin: 0, paddingLeft: 18, lineHeight: 1.6 }}>
              {landed.map((item) => <li key={item}>{item}</li>)}
            </ul>
            {skipped.length > 0 && <p style={{ color: '#6d675e', marginTop: 16 }}>{skipped[skipped.length - 1]}</p>}
            <button type="button" onClick={onDone} style={{ marginTop: 28, background: '#161513', color: '#f3f0e8', border: 'none', padding: '14px 22px', fontFamily: 'var(--font-head)', fontSize: 16, cursor: 'pointer' }}>
              Continue
            </button>
          </>
        )}
      </div>
    </div>
  )
}

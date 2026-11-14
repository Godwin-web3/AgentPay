import { useState } from 'react'
import { claimTestnet } from '../api'
import { useAuth } from '../contexts/AuthContext'

export default function ClaimFunds({ userId, onDone }: { userId: string; onDone: () => void }) {
  const { walletAddress } = useAuth()
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [landed, setLanded] = useState<string[] | null>(null)
  const [copied, setCopied] = useState(false)

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
    } catch (err: any) {
      setError(err.message || 'Nothing was claimed.')
    } finally {
      setLoading(false)
    }
  }

  async function openCircle() {
    if (walletAddress) {
      try {
        await navigator.clipboard.writeText(walletAddress)
        setCopied(true)
      } catch {
        setCopied(false)
      }
    }
    window.open('https://faucet.circle.com/', '_blank', 'noopener')
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
            <p style={{ margin: 0, fontSize: 17, lineHeight: 1.4, maxWidth: '36ch' }}>
              One tap sends test USDG, the stock tokens, and gas. Base and Arc USDC need Circle’s own captcha.
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
            <p style={{ margin: '18px 0 0', maxWidth: '36ch', lineHeight: 1.4 }}>
              Your address is copied. On Circle, pick Base Sepolia, then Arc Testnet, and pass the captcha. Each sends 20 USDC.
            </p>
            {walletAddress && <p style={{ fontFamily: 'var(--font-mono)', fontSize: 12, wordBreak: 'break-all' }}>{walletAddress}</p>}
            <button type="button" onClick={openCircle} style={{ marginTop: 18, background: 'transparent', color: '#161513', border: '1px solid #161513', padding: '14px 22px', fontFamily: 'var(--font-head)', fontSize: 16, cursor: 'pointer' }}>
              {copied ? 'Address copied. Open Circle' : 'Claim Base and Arc USDC'}
            </button>
            <button type="button" onClick={onDone} style={{ marginTop: 12, marginLeft: 12, background: '#161513', color: '#f3f0e8', border: 'none', padding: '14px 22px', fontFamily: 'var(--font-head)', fontSize: 16, cursor: 'pointer' }}>
              Continue
            </button>
          </>
        )}
      </div>
    </div>
  )
}

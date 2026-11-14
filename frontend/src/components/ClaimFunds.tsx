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

  async function openFaucet() {
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
    <div className="sheet">
      <header className="sheet-bar">
        <span className="mark">AgentPay</span>
        <span className="kicker" style={{ margin: 0 }}>Test funds</span>
      </header>
      <main className="sheet-main">
        <h1 className="display display-tight">
          Claim the
          <span className="display-em">testnet.</span>
        </h1>
        {!landed ? (
          <>
            <p className="lede">
              One tap sends test USDG, the stock tokens, and gas to your address. Base and Arc USDC still need a captcha on the public faucet.
            </p>
            {error && <p className="fine" style={{ color: '#8d3b2c' }}>{error}</p>}
            <button type="button" onClick={claim} disabled={loading} className="ink-btn">
              {loading ? 'Claiming' : 'Claim test funds'}
            </button>
          </>
        ) : (
          <>
            <ul className="landed">
              {landed.map((item) => <li key={item}>{item}</li>)}
            </ul>
            <p className="lede">
              {copied
                ? 'Address copied. On the faucet, pick Base Sepolia, then Arc Testnet. Each sends 20 USDC.'
                : 'On the faucet, pick Base Sepolia, then Arc Testnet. Each sends 20 USDC. Tap your address to copy it.'}
            </p>
            {walletAddress && (
              <button type="button" className="addr" onClick={openFaucet}>
                {walletAddress}
              </button>
            )}
            <div className="stack-actions">
              <button type="button" onClick={openFaucet} className="ghost-btn">
                {copied ? 'Address copied. Open faucet' : 'Claim Base and Arc USDC'}
              </button>
              <button type="button" onClick={onDone} className="ink-btn">Continue</button>
            </div>
          </>
        )}
      </main>
    </div>
  )
}

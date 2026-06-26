import { useState, useEffect } from 'react'
import { useAuth } from '../contexts/AuthContext'
import WalletConnect from '../components/WalletConnect'
import { getVaultAddress, checkVault, getWallet, getCircleBalance, depositToVault } from '../api'

interface Props {
  userAddress: string
  onProviderChange?: (provider: any) => void
  onComplete: () => void
}

export default function Onboarding({ userAddress, onProviderChange, onComplete }: Props) {
  const { user } = useAuth();
  const userId = user?.uid || '';
  const [step, setStep] = useState(1)
  const [loading, setLoading] = useState(false)
  const [isDeploying, setIsDeploying] = useState(false)

  // Step 2: Agent Wallet + Funding state
  const [agentWalletAddress, setAgentWalletAddress] = useState('')
  const [agentWalletBalance, setAgentWalletBalance] = useState('0')
  const [copySuccess, setCopySuccess] = useState(false)
  const [depositAmount, setDepositAmount] = useState('1.0')
  const [depositResult, setDepositResult] = useState<{ txHash: string; explorer: string } | null>(null)
  const [depositError, setDepositError] = useState('')

  // Automatically fetch vault and advance when wallet connects
  useEffect(() => {
    if (userAddress && step === 1) {
      resolveVault()
    }
  }, [userAddress])

  async function resolveVault() {
    setLoading(true)
    try {
      const check = await checkVault(userId)
      if (!check.exists) {
        setIsDeploying(true)
        await getVaultAddress(userId)
      }
      const wallet = await getWallet(userId)
      setAgentWalletAddress(wallet.address)
      setAgentWalletBalance(wallet.balance || '0')
      setStep(2)
    } catch (err) {
      console.error("Vault resolution failed", err)
    } finally {
      setLoading(false)
      setIsDeploying(false)
    }
  }

  async function copyAgentWalletAddress() {
    try {
      await navigator.clipboard.writeText(agentWalletAddress)
      setCopySuccess(true)
      setTimeout(() => setCopySuccess(false), 2000)
    } catch (err) {
      console.error("Copy failed", err)
    }
  }

  async function refreshAgentWalletBalance() {
    try {
      const result = await getCircleBalance(userId)
      setAgentWalletBalance(result.balance || '0')
    } catch (err) {
      console.error("Balance refresh failed", err)
    }
  }

  async function handleDeposit() {
    if (!depositAmount || isNaN(Number(depositAmount))) return
    setLoading(true)
    setDepositError('')
    try {
      const result = await depositToVault(depositAmount, userId)
      setDepositResult({ txHash: result.txHash, explorer: result.explorer })
      await refreshAgentWalletBalance()
    } catch (err: any) {
      console.error("Deposit failed", err)
      setDepositError(err?.message || 'Deposit failed')
    } finally {
      setLoading(false)
    }
  }

  function finish() {
    localStorage.setItem(`agentpay_onboarded_${userAddress}`, 'true')
    onComplete()
  }

  return (
    <div className="onboarding-container">
      <div className="progress-stepper" style={{ '--progress': `${((step - 1) / 1) * 100}%` } as any}>
        {[1, 2].map((s) => (
          <div key={s} className={`step-dot ${step === s ? 'active' : ''} ${step > s ? 'completed' : ''}`}>
            {step > s ? '✓' : s}
          </div>
        ))}
      </div>

      <div className="onboarding-card">
        {/* STEP 1: CONNECT */}
        {step === 1 && (
          <div className="step-content">
            <div style={{ fontSize: 40, marginBottom: 20 }}>🔑</div>
            <h2>Step 1: Connect Wallet</h2>
            <p>Connect your wallet to create your Agent Wallet and vault on Arc.</p>
            
            <div style={{ display: 'flex', justifyContent: 'center', transform: 'scale(1.2)', margin: '40px 0' }}>
              <WalletConnect 
                onAddressChange={(addr) => { if (addr) resolveVault() }} 
                onProviderChange={onProviderChange}
              />
            </div>

            {loading && (
              <div style={{ marginTop: 20, color: 'var(--cyan)', fontSize: 13 }}>
                <span className="spinner">⚙️</span> {isDeploying ? 'Deploying your vault on Arc...' : 'Searching for your vault...'}
              </div>
            )}
          </div>
        )}

        {/* STEP 2: FUND */}
        {step === 2 && (
          <div className="step-content">
            <div style={{ fontSize: 40, marginBottom: 20 }}>💰</div>
            <h2>Step 2: Fund Your Agent Wallet</h2>
            <p style={{ fontSize: 11, color: 'var(--muted)', marginTop: 10 }}>
              Send USDC from your wallet to your Agent Wallet below, then deposit it into your vault. Your Agent uses vault funds to execute your intents.
            </p>

            <div style={{ marginTop: 20, width: '100%', textAlign: 'left' }}>
              <label style={{ fontSize: 10, display: 'block', marginBottom: 6, color: 'var(--muted)' }}>YOUR AGENT WALLET ADDRESS</label>
              <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                <code style={{ flex: 1, fontSize: 11, color: 'var(--cyan)', background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 6, padding: 10, wordBreak: 'break-all' }}>
                  {agentWalletAddress}
                </code>
                <button className="send-btn" onClick={copyAgentWalletAddress} style={{ flexShrink: 0 }}>
                  {copySuccess ? 'Copied' : 'Copy'}
                </button>
              </div>
              <p style={{ fontSize: 10, color: 'var(--muted)', marginTop: 8 }}>Agent Wallet balance: {agentWalletBalance} USDC</p>
            </div>

            <div style={{ marginTop: 25, width: '100%' }}>
              <label style={{ fontSize: 10, display: 'block', marginBottom: 8, color: 'var(--muted)' }}>AMOUNT TO DEPOSIT TO VAULT (USDC)</label>
              <input
                type="number"
                value={depositAmount}
                onChange={e => setDepositAmount(e.target.value)}
                style={{ width: '100%', padding: 12, background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 6, color: 'var(--text)' }}
              />

              <button
                className="send-btn"
                onClick={handleDeposit}
                disabled={loading}
                style={{ width: '100%', marginTop: 15 }}
              >
                {loading ? 'Processing...' : 'Deposit to Vault'}
              </button>

              {depositResult && (
                <div style={{ marginTop: 15, fontSize: 10 }}>
                  ✅ Deposited: <a href={depositResult.explorer} target="_blank" style={{ color: 'var(--blue)' }}>{depositResult.txHash.slice(0, 20)}...</a>
                </div>
              )}
              {depositError && (
                <div style={{ marginTop: 15, fontSize: 11, color: 'var(--danger)' }}>
                  {depositError}
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      <button 
        className="skip-link" 
        onClick={() => {
          if (step === 1) setStep(2)
          else finish()
        }}
        style={{ margin: '20px auto', display: 'block' }}
      >
        Skip this step →
      </button>
    </div>
  )
}

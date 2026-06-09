import { useState, useEffect } from 'react'
import WalletConnect from '../components/WalletConnect'
import { getVaultAddress, updatePolicy, checkVault } from '../api'

interface Props {
  userAddress: string
  onComplete: () => void
}

export default function Onboarding({ userAddress, onComplete }: Props) {
  const [step, setStep] = useState(1)
  const [vaultAddress, setVaultAddress] = useState('')
  const [loading, setLoading] = useState(false)
  const [isDeploying, setIsDeploying] = useState(false)
  const [activeProvider, setActiveProvider] = useState<any>(null)
  
  // Step 2: Funding State
  const [depositAmount, setDepositAmount] = useState('1.0')
  const [txHash, setTxHash] = useState('')

  // Step 3: Policy State
  const [perTxCap, setPerTxCap] = useState('10')
  const [dailyCap, setDailyCap] = useState('50')
  const [startHour, setStartHour] = useState(0)
  const [endHour, setEndHour] = useState(24)

  // Automatically fetch vault and advance when wallet connects
  useEffect(() => {
    if (userAddress && step === 1) {
      resolveVault()
    }
  }, [userAddress])

  async function resolveVault() {
    setLoading(true)
    try {
      const check = await checkVault(userAddress)
      if (check.exists && check.address) {
        setVaultAddress(check.address)
        setStep(2)
      } else {
        setIsDeploying(true)
        const res = await getVaultAddress(userAddress)
        setVaultAddress(res.address)
        setStep(2)
      }
    } catch (err) {
      console.error("Vault resolution failed", err)
    } finally {
      setLoading(false)
      setIsDeploying(false)
    }
  }

  async function handleDeposit() {
    if (!activeProvider || !vaultAddress) return
    setLoading(true)
    try {
      const value = '0x' + (BigInt(Math.floor(Number(depositAmount) * 1e18))).toString(16)
      const hash = await activeProvider.request({
        method: 'eth_sendTransaction',
        params: [{
          from: userAddress,
          to: vaultAddress,
          data: '0xd0e30db0', // deposit()
          value
        }]
      })
      setTxHash(hash)
    } catch (err) {
      console.error("Deposit failed", err)
    } finally {
      setLoading(false)
    }
  }

  async function handleSetPolicy() {
    setLoading(true)
    try {
      await updatePolicy({
        perTxCap: Number(perTxCap),
        dailyCap: Number(dailyCap),
        activeHours: { start: Number(startHour), end: Number(endHour) }
      }, userAddress)
      finish()
    } catch (err) {
      console.error("Policy update failed", err)
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
      <div className="progress-stepper" style={{ '--progress': `${((step - 1) / 2) * 100}%` } as any}>
        {[1, 2, 3].map((s) => (
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
            <p>Connect your wallet to establish your autonomous agent identity on Somnia.</p>
            
            <div style={{ display: 'flex', justifyContent: 'center', transform: 'scale(1.2)', margin: '40px 0' }}>
              <WalletConnect 
                onAddressChange={(addr) => { if (addr) resolveVault() }} 
                onProviderChange={(p) => setActiveProvider(p)}
              />
            </div>

            {loading && (
              <div style={{ marginTop: 20, color: 'var(--cyan)', fontSize: 13 }}>
                <span className="spinner">⚙️</span> {isDeploying ? 'Deploying your vault on Somnia...' : 'Searching for your vault...'}
              </div>
            )}
          </div>
        )}

        {/* STEP 2: FUND */}
        {step === 2 && (
          <div className="step-content">
            <div style={{ fontSize: 40, marginBottom: 20 }}>💰</div>
            <h2>Step 2: Fund Your Vault</h2>
            <p>Vault Ready: <code style={{ fontSize: 10, color: 'var(--cyan)' }}>{vaultAddress}</code></p>
            <p style={{ fontSize: 11, color: 'var(--muted)', marginTop: 10 }}>Your Agent uses these funds to execute your intents.</p>

            <div style={{ marginTop: 25, width: '100%' }}>
              <label style={{ fontSize: 10, display: 'block', marginBottom: 8, color: 'var(--muted)' }}>AMOUNT TO DEPOSIT (STT)</label>
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
                {loading ? 'Processing...' : 'Deposit'}
              </button>

              {txHash && (
                <div style={{ marginTop: 15, fontSize: 10 }}>
                  ✅ Sent: <a href={`https://shannon-explorer.somnia.network/tx/${txHash}`} target="_blank" style={{ color: 'var(--blue)' }}>{txHash.slice(0, 20)}...</a>
                </div>
              )}
            </div>
          </div>
        )}

        {/* STEP 3: POLICY */}
        {step === 3 && (
          <div className="step-content">
            <div style={{ fontSize: 40, marginBottom: 20 }}>🛡️</div>
            <h2>Step 3: Set Your Policy</h2>
            <p>Configure spending rules that your Agent must follow on-chain.</p>

            <div style={{ marginTop: 25, width: '100%', textAlign: 'left', display: 'flex', flexDirection: 'column', gap: 15 }}>
              <div>
                <label style={{ fontSize: 10, color: 'var(--muted)' }}>MAX PER TRANSACTION (STT)</label>
                <input type="number" value={perTxCap} onChange={e => setPerTxCap(e.target.value)} style={{ width: '100%', padding: 10, background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 6, color: 'var(--text)' }} />
              </div>

              <div>
                <label style={{ fontSize: 10, color: 'var(--muted)' }}>DAILY SPENDING CAP (STT)</label>
                <input type="number" value={dailyCap} onChange={e => setDailyCap(e.target.value)} style={{ width: '100%', padding: 10, background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 6, color: 'var(--text)' }} />
              </div>

              <div style={{ display: 'flex', gap: 10 }}>
                <div style={{ flex: 1 }}>
                  <label style={{ fontSize: 10, color: 'var(--muted)' }}>START HOUR</label>
                  <select value={startHour} onChange={e => setStartHour(Number(e.target.value))} style={{ width: '100%', padding: 10, background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 6, color: 'var(--text)' }}>
                    {Array.from({ length: 25 }, (_, i) => <option key={i} value={i}>{i}:00</option>)}
                  </select>
                </div>
                <div style={{ flex: 1 }}>
                  <label style={{ fontSize: 10, color: 'var(--muted)' }}>END HOUR</label>
                  <select value={endHour} onChange={e => setEndHour(Number(e.target.value))} style={{ width: '100%', padding: 10, background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 6, color: 'var(--text)' }}>
                    {Array.from({ length: 25 }, (_, i) => <option key={i} value={i}>{i}:00</option>)}
                  </select>
                </div>
              </div>

              <button 
                className="send-btn" 
                onClick={handleSetPolicy} 
                disabled={loading}
                style={{ width: '100%', marginTop: 10 }}
              >
                {loading ? 'Saving...' : 'Set Policy'}
              </button>
            </div>
          </div>
        )}
      </div>

      <button 
        className="skip-link" 
        onClick={() => {
          if (step === 1) setStep(2)
          else if (step === 2) setStep(3)
          else finish()
        }}
        style={{ margin: '20px auto', display: 'block' }}
      >
        Skip this step →
      </button>
    </div>
  )
}

import { useState } from 'react'
import History from './History'

interface Props {
  userAddress: string
  vaultBalance: string
  walletBalance: string
  activeProvider: any
  onSwap?: (amount: string, token: string) => void
}

const VAULT_ADDRESS = '0x7E5235C0c711Cf2CA57a18d7BFD79a8cd453793D'

export default function Profile({ userAddress, vaultBalance, walletBalance, activeProvider, onSwap }: Props) {
  const [showWithdraw, setShowWithdraw] = useState(false)
  const [withdrawAmount, setWithdrawAmount] = useState('')
  const [loading, setLoading] = useState(false)
  const [copied, setCopied] = useState(false)
  const [showDeposit, setShowDeposit] = useState(false)
  const [depositAmount, setDepositAmount] = useState('')
  const [depositLoading, setDepositLoading] = useState(false)
  const [showSwap, setShowSwap] = useState(false)
  const [swapAmount, setSwapAmount] = useState('')
  const [swapToken, setSwapToken] = useState('PING')

  function shortAddr(addr: string) {
    return addr.slice(0, 6) + '...' + addr.slice(-4)
  }

  function copyAddress() {
    navigator.clipboard.writeText(userAddress)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  async function handleWithdraw() {
    if (!withdrawAmount || isNaN(Number(withdrawAmount)) || !activeProvider) return
    setLoading(true)
    try {
      const amount = '0x' + BigInt(Math.floor(Number(withdrawAmount) * 1e18)).toString(16)
      const data = '0x2e1a7d4d' + amount.replace('0x', '').padStart(64, '0')
      await activeProvider.request({
        method: 'eth_sendTransaction',
        params: [{ from: userAddress, to: VAULT_ADDRESS, data }]
      })
      setShowWithdraw(false)
      setWithdrawAmount('')
    } catch (err) {
      console.error('Withdraw failed', err)
    } finally {
      setLoading(false)
    }
  }

  async function handleDeposit() {
    if (!depositAmount || isNaN(Number(depositAmount)) || !activeProvider) return
    setDepositLoading(true)
    try {
      const value = '0x' + BigInt(Math.floor(Number(depositAmount) * 1e18)).toString(16)
      await activeProvider.request({
        method: 'eth_sendTransaction',
        params: [{ from: userAddress, to: VAULT_ADDRESS, data: '0xd0e30db0', value }]
      })
      setShowDeposit(false)
      setDepositAmount('')
    } catch (err) {
      console.error('Deposit failed', err)
    } finally {
      setDepositLoading(false)
    }
  }

  if (!userAddress) {
    return (
      <div style={{ padding: 32, textAlign: 'center', color: 'var(--muted)' }}>
        Connect your wallet to view your profile.
      </div>
    )
  }

  return (
    <div style={{ padding: 16, maxWidth: 480, margin: '0 auto' }}>
      <div className="card" style={{ marginBottom: 16 }}>
        <div style={{ fontSize: 10, color: 'var(--muted)', textTransform: 'uppercase', marginBottom: 4 }}>Wallet</div>
        <div
          style={{ fontFamily: 'var(--font-mono)', color: 'var(--cyan)', cursor: 'pointer', fontSize: 14 }}
          onClick={copyAddress}
        >
          {shortAddr(userAddress)} {copied ? '✅' : '📋'}
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 16 }}>
        <div className="card">
          <div style={{ fontSize: 10, color: 'var(--muted)', textTransform: 'uppercase', marginBottom: 4 }}>Wallet Balance</div>
          <div style={{ fontFamily: 'var(--font-mono)', color: 'var(--cyan)', fontSize: 18, fontWeight: 'bold' }}>{walletBalance}</div>
          <div style={{ fontSize: 10, color: 'var(--muted)' }}>STT</div>
        </div>
        <div className="card">
          <div style={{ fontSize: 10, color: 'var(--muted)', textTransform: 'uppercase', marginBottom: 4 }}>Vault Balance</div>
          <div style={{ fontFamily: 'var(--font-mono)', color: 'var(--cyan)', fontSize: 18, fontWeight: 'bold' }}>{vaultBalance}</div>
          <div style={{ fontSize: 10, color: 'var(--muted)' }}>STT</div>
        </div>
      </div>

      <div style={{ display: 'flex', gap: 10, marginBottom: 10 }}>
        <button className="send-btn" style={{ flex: 1 }} onClick={() => { setShowDeposit(true); setShowWithdraw(false); setShowSwap(false) }}>
          Deposit to Vault
        </button>
        <button className="send-btn" style={{ flex: 1, background: 'transparent', border: '1px solid var(--cyan)', color: 'var(--cyan)' }} onClick={() => { setShowWithdraw(true); setShowDeposit(false); setShowSwap(false) }}>
          Withdraw from Vault
        </button>
      </div>

      <button 
        className="send-btn" 
        style={{ width: '100%', marginBottom: 16, background: 'var(--cyan)', color: '#000' }}
        onClick={() => { setShowSwap(true); setShowDeposit(false); setShowWithdraw(false) }}
      >
        🔄 Quick Swap STT
      </button>

      {showSwap && (
        <div className="card" style={{ marginBottom: 16, border: '1px solid var(--cyan)' }}>
          <div style={{ fontSize: 11, color: 'var(--muted)', marginBottom: 8 }}>Swap STT for other assets</div>
          <div style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
            <input
              type="number"
              placeholder="0.00"
              value={swapAmount}
              onChange={e => setSwapAmount(e.target.value)}
              style={{ flex: 2, padding: '8px 12px', background: 'rgba(0,0,0,0.3)', border: '1px solid var(--border)', borderRadius: 8, color: 'var(--text)', fontFamily: 'var(--font-mono)', boxSizing: 'border-box' }}
            />
            <select 
              value={swapToken}
              onChange={e => setSwapToken(e.target.value)}
              style={{ flex: 1, padding: '8px', background: '#111', border: '1px solid var(--border)', borderRadius: 8, color: 'var(--cyan)' }}
            >
              <option value="PING">PING</option>
              <option value="PONG">PONG</option>
              <option value="USDC">USDC</option>
            </select>
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button className="send-btn" onClick={() => onSwap?.(swapAmount, swapToken)} style={{ flex: 1 }}>
              Propose Swap
            </button>
            <button onClick={() => setShowSwap(false)} style={{ flex: 1, padding: '10px', background: 'transparent', border: '1px solid var(--border)', borderRadius: 8, color: 'var(--muted)', cursor: 'pointer' }}>
              Cancel
            </button>
          </div>
        </div>
      )}

      {showWithdraw && (
        <div className="card" style={{ marginBottom: 16 }}>
          <div style={{ fontSize: 11, color: 'var(--muted)', marginBottom: 8 }}>Amount to withdraw (max {vaultBalance} STT)</div>
          <input
            type="number"
            placeholder="0.00"
            value={withdrawAmount}
            onChange={e => setWithdrawAmount(e.target.value)}
            style={{ width: '100%', padding: '8px 12px', background: 'rgba(0,0,0,0.3)', border: '1px solid var(--border)', borderRadius: 8, color: 'var(--text)', fontFamily: 'var(--font-mono)', marginBottom: 8, boxSizing: 'border-box' }}
          />
          <div style={{ display: 'flex', gap: 8 }}>
            <button className="send-btn" onClick={handleWithdraw} disabled={loading} style={{ flex: 1 }}>
              {loading ? 'Confirming...' : 'Confirm'}
            </button>
            <button onClick={() => setShowWithdraw(false)} style={{ flex: 1, padding: '10px', background: 'transparent', border: '1px solid var(--border)', borderRadius: 8, color: 'var(--muted)', cursor: 'pointer' }}>
              Cancel
            </button>
          </div>
        </div>
      )}

      {showDeposit && (
        <div className="card" style={{ marginBottom: 16 }}>
          <div style={{ fontSize: 11, color: 'var(--muted)', marginBottom: 8 }}>Amount to deposit (max {walletBalance} STT)</div>
          <input
            type="number"
            placeholder="0.00"
            value={depositAmount}
            onChange={e => setDepositAmount(e.target.value)}
            style={{ width: '100%', padding: '8px 12px', background: 'rgba(0,0,0,0.3)', border: '1px solid var(--border)', borderRadius: 8, color: 'var(--text)', fontFamily: 'var(--font-mono)', marginBottom: 8, boxSizing: 'border-box' }}
          />
          <div style={{ display: 'flex', gap: 8 }}>
            <button className="send-btn" onClick={handleDeposit} disabled={depositLoading} style={{ flex: 1 }}>
              {depositLoading ? 'Confirming...' : 'Confirm'}
            </button>
            <button onClick={() => setShowDeposit(false)} style={{ flex: 1, padding: '10px', background: 'transparent', border: '1px solid var(--border)', borderRadius: 8, color: 'var(--muted)', cursor: 'pointer' }}>
              Cancel
            </button>
          </div>
        </div>
      )}

      <div style={{ marginTop: 8 }}>
        <div style={{ fontSize: 11, color: 'var(--muted)', textTransform: 'uppercase', marginBottom: 12 }}>Transaction History</div>
        <History userAddress={userAddress} />
      </div>
    </div>
  )
}

import { useState } from 'react'

interface Props {
  userAddress: string
  vaultBalance: string
  walletBalance: string
  tokenBalances: Record<string, string>
  activeProvider: any
  onBack: () => void
}

const VAULT_ADDRESS = '0x7E5235C0c711Cf2CA57a18d7BFD79a8cd453793D'

export default function Vault({ userAddress, vaultBalance, walletBalance, tokenBalances, activeProvider, onBack }: Props) {
  const [showDeposit, setShowDeposit] = useState(false)
  const [showWithdraw, setShowWithdraw] = useState(false)
  const [depositAmount, setDepositAmount] = useState('')
  const [withdrawAmount, setWithdrawAmount] = useState('')
  const [depositLoading, setDepositLoading] = useState(false)
  const [withdrawLoading, setWithdrawLoading] = useState(false)

  async function handleDeposit() {
    setDepositLoading(true)
    try {
      const value = '0x' + BigInt(Math.floor(Number(depositAmount) * 1e18)).toString(16)
      await activeProvider.request({ method: 'eth_sendTransaction', params: [{ from: userAddress, to: '0x7E5235C0c711Cf2CA57a18d7BFD79a8cd453793D', data: '0xd0e30db0', value }] })
      setShowDeposit(false)
      setDepositAmount('')
    } catch (err) { console.error(err) } finally { setDepositLoading(false) }
  }

  async function handleWithdraw() {
    setWithdrawLoading(true)
    try {
      const amount = '0x' + BigInt(Math.floor(Number(withdrawAmount) * 1e18)).toString(16)
      const data = '0x2e1a7d4d' + amount.replace('0x', '').padStart(64, '0')
      await activeProvider.request({ method: 'eth_sendTransaction', params: [{ from: userAddress, to: '0x7E5235C0c711Cf2CA57a18d7BFD79a8cd453793D', data }] })
      setShowWithdraw(false)
      setWithdrawAmount('')
    } catch (err) { console.error(err) } finally { setWithdrawLoading(false) }
  }

  return (
    <div style={{ padding: 16, maxWidth: 480, margin: '0 auto' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 24 }}>
        <button onClick={onBack} style={{ background: 'none', border: 'none', color: 'var(--muted)', cursor: 'pointer', fontFamily: 'var(--font-mono)', fontSize: 13 }}>← Back</button>
        <span style={{ fontFamily: 'var(--font-mono)', fontSize: 13, color: 'var(--text)' }}>VAULT</span>
      </div>

      <div style={{ marginBottom: 16 }}>
        <div style={{ fontSize: 10, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 8 }}>Wallet Balances</div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
          {[['STT', walletBalance], ['WSTT', tokenBalances.WSTT || '0.0000'], ['PING', tokenBalances.PING || '0.0000'], ['PONG', tokenBalances.PONG || '0.0000'], ['SUSD', tokenBalances.SUSD || '0.0000']].map(([sym, bal]) => (
            <div className="card" key={sym} style={{ padding: '10px 12px' }}>
              <div style={{ fontSize: 10, color: 'var(--muted)', marginBottom: 2 }}>{sym}</div>
              <div style={{ fontFamily: 'var(--font-mono)', color: 'var(--cyan)', fontSize: 15, fontWeight: 'bold' }}>{bal}</div>
            </div>
          ))}
        </div>
      </div>

      <div className="card" style={{ marginBottom: 16, padding: '10px 12px', border: '1px solid var(--border)' }}>
        <div style={{ fontSize: 10, color: 'var(--muted)', marginBottom: 2 }}>VAULT BALANCE</div>
        <div style={{ fontFamily: 'var(--font-mono)', color: 'var(--cyan)', fontSize: 20, fontWeight: 'bold' }}>{vaultBalance} STT</div>
      </div>

      <div style={{ display: 'flex', gap: 10, marginBottom: 12 }}>
        <button className="send-btn" style={{ flex: 1 }} onClick={() => { setShowDeposit(true); setShowWithdraw(false) }}>Deposit</button>
        <button className="send-btn" style={{ flex: 1, background: 'transparent', border: '1px solid var(--cyan)', color: 'var(--cyan)' }} onClick={() => { setShowWithdraw(true); setShowDeposit(false) }}>Withdraw</button>
      </div>

      {showDeposit && (
        <div className="card" style={{ marginBottom: 12 }}>
          <div style={{ fontSize: 11, color: 'var(--muted)', marginBottom: 8 }}>Amount to deposit (max {walletBalance} STT)</div>
          <input type="number" placeholder="0.00" value={depositAmount} onChange={e => setDepositAmount(e.target.value)} style={{ width: '100%', padding: '8px 12px', background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 3, color: 'var(--text)', fontFamily: 'var(--font-mono)', marginBottom: 8, boxSizing: 'border-box' }} />
          <div style={{ display: 'flex', gap: 8 }}>
            <button className="send-btn" onClick={handleDeposit} disabled={depositLoading} style={{ flex: 1 }}>{depositLoading ? 'Confirming...' : 'Confirm'}</button>
            <button onClick={() => setShowDeposit(false)} style={{ flex: 1, padding: '10px', background: 'transparent', border: '1px solid var(--border)', borderRadius: 3, color: 'var(--muted)', cursor: 'pointer' }}>Cancel</button>
          </div>
        </div>
      )}

      {showWithdraw && (
        <div className="card" style={{ marginBottom: 12 }}>
          <div style={{ fontSize: 11, color: 'var(--muted)', marginBottom: 8 }}>Amount to withdraw (max {vaultBalance} STT)</div>
          <input type="number" placeholder="0.00" value={withdrawAmount} onChange={e => setWithdrawAmount(e.target.value)} style={{ width: '100%', padding: '8px 12px', background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 3, color: 'var(--text)', fontFamily: 'var(--font-mono)', marginBottom: 8, boxSizing: 'border-box' }} />
          <div style={{ display: 'flex', gap: 8 }}>
            <button className="send-btn" onClick={handleWithdraw} disabled={withdrawLoading} style={{ flex: 1 }}>{withdrawLoading ? 'Confirming...' : 'Confirm'}</button>
            <button onClick={() => setShowWithdraw(false)} style={{ flex: 1, padding: '10px', background: 'transparent', border: '1px solid var(--border)', borderRadius: 3, color: 'var(--muted)', cursor: 'pointer' }}>Cancel</button>
          </div>
        </div>
      )}
    </div>
  )
}

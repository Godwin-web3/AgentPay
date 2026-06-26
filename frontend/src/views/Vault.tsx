import { useState } from 'react'
import { useAuth } from '../contexts/AuthContext'
import { depositToVault, withdrawFromVault, logTransaction, decodePolicyError } from '../api'

interface Props {
  userAddress: string
  vaultBalance: string
  walletBalance: string
  tokenBalances: Record<string, string>
  activeProvider: any
  onBack: () => void
  onActionSuccess?: () => void
}

export default function Vault({
  const { user } = useAuth();
  userAddress, vaultBalance, walletBalance, tokenBalances, onBack, onActionSuccess }: Props) {
  const { user } = useAuth();
  const userId = user?.uid || '';
  const [mode, setMode] = useState<null | 'deposit' | 'withdraw'>(null)
  const [amount, setAmount] = useState('')
  const [selectedToken, setSelectedToken] = useState('USDC')
  const [loading, setLoading] = useState(false)
  const [txStatus, setTxStatus] = useState<string | null>(null)

  async function handleDeposit() {
    setLoading(true)
    setTxStatus(null)
    try {
      const result = await depositToVault(amount, userId)
      setTxStatus('[OK] Deposit confirmed!')
      await logTransaction({ userAddress, type: 'deposit', amount, token: selectedToken, txHash: result.txHash })
      setMode(null)
      setAmount('')
      if (onActionSuccess) onActionSuccess()
    } catch (err: any) {
      const decoded = decodePolicyError(err)
      setTxStatus('[ERROR] ' + (decoded || err?.message || 'Transaction failed'))
    } finally { setLoading(false) }
  }

  async function handleWithdraw() {
    setLoading(true)
    setTxStatus(null)
    try {
      const result = await withdrawFromVault(amount, userId)
      setTxStatus('[OK] Withdrawal confirmed!')
      await logTransaction({ userAddress, type: 'withdrawal', amount, token: selectedToken, txHash: result.txHash })
      setMode(null)
      setAmount('')
      if (onActionSuccess) onActionSuccess()
    } catch (err: any) {
      const decoded = decodePolicyError(err)
      setTxStatus('[ERROR] ' + (decoded || err?.message || 'Transaction failed'))
    } finally { setLoading(false) }
  }

  const tokens = [
    { symbol: 'USDC', balance: tokenBalances.USDC || walletBalance, label: 'USD Coin' },
  ]

  return (
    <div style={{ maxWidth: 480, margin: '0 auto', padding: 16 }}>

      {/* Back */}
      <button onClick={onBack} style={{
        background: 'none', border: 'none', color: 'var(--muted)',
        cursor: 'pointer', fontFamily: 'var(--font-mono)', fontSize: 11,
        letterSpacing: 2, marginBottom: 24, padding: 0,
      }}>
        ← BACK
      </button>

      {/* Total vault balance */}
      <div style={{ marginBottom: 24 }}>
        <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10, letterSpacing: 3, color: 'var(--muted)', marginBottom: 8 }}>
          VAULT BALANCE
        </div>
        <div style={{ fontFamily: 'var(--font-head)', fontSize: 40, fontWeight: 800, color: 'var(--text)', lineHeight: 1 }}>
          {vaultBalance} <span style={{ fontSize: 18, color: 'var(--muted)', fontWeight: 400 }}>USDC</span>
        </div>
      </div>

      {/* Action buttons */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 28 }}>
        <button
          onClick={() => { setMode('deposit'); setAmount(''); setTxStatus(null) }}
          style={{
            padding: '12px 8px',
            background: mode === 'deposit' ? 'var(--cyan)' : 'var(--cyan)',
            border: '1px solid var(--cyan)',
            color: '#0A0A0A',
            fontFamily: 'var(--font-mono)',
            fontSize: 10,
            letterSpacing: 1.5,
            cursor: 'pointer',
            fontWeight: 700,
          }}
        >
          DEPOSIT
        </button>
        <button
          onClick={() => { setMode('withdraw'); setAmount(''); setTxStatus(null) }}
          style={{
            padding: '12px 8px',
            background: 'transparent',
            border: '1px solid var(--border)',
            color: 'var(--muted)',
            fontFamily: 'var(--font-mono)',
            fontSize: 10,
            letterSpacing: 1.5,
            cursor: 'pointer',
          }}
        >
          WITHDRAW
        </button>
      </div>

      {/* Deposit / Withdraw form */}
      {mode && (
        <div style={{ border: '1px solid var(--border)', background: 'var(--bg-card)', padding: 16, marginBottom: 24 }}>
          <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10, letterSpacing: 2, color: 'var(--muted)', marginBottom: 12 }}>
            {mode === 'deposit' ? `DEPOSIT` : `WITHDRAW`}
          </div>

          <select 
            value={selectedToken}
            onChange={e => setSelectedToken(e.target.value)}
            style={{
              width: '100%',
              padding: '10px 12px',
              background: 'var(--bg)',
              border: '1px solid var(--border)',
              color: 'var(--text)',
              fontFamily: 'var(--font-mono)',
              fontSize: 14,
              marginBottom: 12,
              boxSizing: 'border-box',
              outline: 'none',
              borderRadius: 0,
            }}
          >
            {['USDC'].map(t => (
              <option key={t} value={t}>{t}</option>
            ))}
          </select>

          <input
            type="number"
            placeholder="0.00"
            value={amount}
            onChange={e => setAmount(e.target.value)}
            style={{
              width: '100%',
              padding: '10px 12px',
              background: 'var(--bg)',
              border: '1px solid var(--border)',
              color: 'var(--text)',
              fontFamily: 'var(--font-mono)',
              fontSize: 16,
              marginBottom: 12,
              boxSizing: 'border-box',
              outline: 'none',
            }}
          />
          <div style={{ display: 'flex', gap: 8 }}>
            <button
              onClick={mode === 'deposit' ? handleDeposit : handleWithdraw}
              disabled={loading || !amount}
              style={{
                flex: 1, padding: '10px',
                background: 'var(--cyan)',
                border: 'none',
                color: '#0A0A0A',
                fontFamily: 'var(--font-mono)',
                fontSize: 11, letterSpacing: 2,
                cursor: loading ? 'not-allowed' : 'pointer',
                fontWeight: 700,
                opacity: loading || !amount ? 0.5 : 1,
              }}
            >
              {loading ? 'CONFIRMING...' : 'CONFIRM'}
            </button>
            <button
              onClick={() => { setMode(null); setAmount('') }}
              style={{
                padding: '10px 20px',
                background: 'transparent',
                border: '1px solid var(--border)',
                color: 'var(--muted)',
                fontFamily: 'var(--font-mono)',
                fontSize: 11,
                cursor: 'pointer',
              }}
            >
              CANCEL
            </button>
          </div>
        </div>
      )}

      {/* Tx status */}
      {txStatus && (
        <div style={{
          fontFamily: 'var(--font-mono)', fontSize: 11,
          color: txStatus.startsWith('[OK]') ? 'var(--cyan)' : 'var(--danger)',
          marginBottom: 20, letterSpacing: 1,
        }}>
          {txStatus}
        </div>
      )}

      {/* Token list */}
      <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10, letterSpacing: 3, color: 'var(--muted)', marginBottom: 12 }}>
        WALLET BALANCES
      </div>
      <div style={{ display: 'flex', flexDirection: 'column' }}>
        {tokens.map((t, i) => (
          <div key={t.symbol} style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '14px 0',
            borderBottom: i < tokens.length - 1 ? '1px solid var(--border)' : 'none',
          }}>
            <div>
              <div style={{ fontFamily: 'var(--font-mono)', fontSize: 13, color: 'var(--text)', fontWeight: 600 }}>{t.symbol}</div>
              <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--muted)', marginTop: 2 }}>{t.label}</div>
            </div>
            <div style={{ fontFamily: 'var(--font-mono)', fontSize: 14, color: 'var(--cyan)', fontWeight: 600 }}>
              {t.balance}
            </div>
          </div>
        ))}
      </div>

    </div>
  )
}

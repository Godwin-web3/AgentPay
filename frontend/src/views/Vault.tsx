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

export default function Vault({ userAddress: _userAddress, vaultBalance, walletBalance, tokenBalances, onBack, onActionSuccess }: Props) {
  const { user } = useAuth();
  const userId = user?.uid || '';
  const [mode, setMode] = useState<null | 'deposit' | 'withdraw'>(null)
  const [amount, setAmount] = useState('')
  const selectedToken = 'USDC'
  const [loading, setLoading] = useState(false)
  const [txStatus, setTxStatus] = useState<string | null>(null)

  async function handleDeposit() {
    setLoading(true)
    setTxStatus(null)
    try {
      const result = await depositToVault(amount, userId)
      setTxStatus('[OK] Deposit confirmed!')
      await logTransaction({ userId, type: 'deposit', amount, token: selectedToken, txHash: result.txHash })
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
      await logTransaction({ userId, type: 'withdrawal', amount, token: selectedToken, txHash: result.txHash })
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
    <div className="desk">
      <button type="button" onClick={onBack} className="back-link">Back</button>
      <p className="kicker">Vault</p>
      <h2 className="page-title money-inline">{vaultBalance}</h2>
      <p className="lede desk-lede">This is what the agent can spend after you deposit. Your wallet stays separate.</p>

      <div className="desk-actions split">
        <button type="button" className={mode === 'deposit' ? 'ink-btn' : 'ghost-btn'} onClick={() => { setMode('deposit'); setAmount(''); setTxStatus(null) }}>
          Deposit
        </button>
        <button type="button" className={mode === 'withdraw' ? 'ink-btn' : 'ghost-btn'} onClick={() => { setMode('withdraw'); setAmount(''); setTxStatus(null) }}>
          Withdraw
        </button>
      </div>

      {mode && (
        <form className="slip" onSubmit={(e) => { e.preventDefault(); if (mode === 'deposit') handleDeposit(); else handleWithdraw() }}>
          <p className="kicker">{mode === 'deposit' ? 'Into the vault' : 'Back to your wallet'}</p>
          <label className="rule-field">
            <span className="chain-name">{selectedToken}</span>
            <input
              type="number"
              inputMode="decimal"
              placeholder="0.00"
              value={amount}
              onChange={e => setAmount(e.target.value)}
              aria-label="Amount"
            />
          </label>
          <div className="desk-actions split">
            <button type="submit" className="ink-btn" disabled={loading || !amount}>
              {loading ? 'Confirming' : 'Confirm'}
            </button>
            <button type="button" className="ghost-btn" onClick={() => { setMode(null); setAmount('') }}>
              Cancel
            </button>
          </div>
        </form>
      )}

      {txStatus && (
        <p className={txStatus.startsWith('[OK]') ? 'fine' : 'fine is-danger'}>
          {txStatus.replace('[OK] ', '').replace('[ERROR] ', '')}
        </p>
      )}

      <div className="ledger-block">
        <p className="kicker">Wallet</p>
        <div className="ledger">
          {tokens.map((t) => (
            <div key={t.symbol} className="hold-row">
              <span>{t.symbol}<span className="ledger-sub"> {t.label}</span></span>
              <span>{t.balance}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

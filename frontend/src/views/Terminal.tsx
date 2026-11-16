import React, { useRef, useEffect } from 'react'
import { useWallets } from '@privy-io/react-auth'
import { sendChat, generateRequestId, getPolicy, updatePolicy, getChatHistory, clearChatHistory, getVaultBalanceApi, createOnChainSchedule, decodePolicyError, quoteSwap, quoteBridge, executePay, proposeSpendInPool, createPool, contributeToPool } from '../api'
import { sendFromWallet, sendUsdc, depositFromWallet, swapFromWallet, bridgeFromWallet, signerFor, sendContractCall } from '../spend'

const MOVES: any[] = [
  { id: 'hood-usdg', label: 'USDG', where: 'Robinhood', mode: 'send', chainId: 46630, symbol: 'USDG', kind: 'erc20' as const, address: '0x42fa9A8085c0bc633Afa4e19a1f491db9a4dC0fE', decimals: 6 },
  { id: 'hood-eth', label: 'ETH', where: 'Robinhood', mode: 'send', chainId: 46630, symbol: 'ETH', kind: 'native' as const, decimals: 18 },
  { id: 'hood-tsla', label: 'TSLA', where: 'Robinhood', mode: 'send', chainId: 46630, symbol: 'TSLA', kind: 'erc20' as const, address: '0xC9f9c86933092BbbfFF3CCb4b105A4A94bf3Bd4E', decimals: 18 },
  { id: 'hood-amd', label: 'AMD', where: 'Robinhood', mode: 'send', chainId: 46630, symbol: 'AMD', kind: 'erc20' as const, address: '0x71178BAc73cBeb415514eB542a8995b82669778d', decimals: 18 },
  { id: 'hood-amzn', label: 'AMZN', where: 'Robinhood', mode: 'send', chainId: 46630, symbol: 'AMZN', kind: 'erc20' as const, address: '0x5884aD2f920c162CFBbACc88C9C51AA75eC09E02', decimals: 18 },
  { id: 'hood-nflx', label: 'NFLX', where: 'Robinhood', mode: 'send', chainId: 46630, symbol: 'NFLX', kind: 'erc20' as const, address: '0x3b8262A63d25f0477c4DDE23F83cfe22Cb768C93', decimals: 18 },
  { id: 'hood-pltr', label: 'PLTR', where: 'Robinhood', mode: 'send', chainId: 46630, symbol: 'PLTR', kind: 'erc20' as const, address: '0x1FBE1a0e43594b3455993B5dE5Fd0A7A266298d0', decimals: 18 },
  { id: 'base-usdc', label: 'USDC', where: 'Base', mode: 'send', chainId: 84532, symbol: 'USDC', kind: 'erc20' as const, address: '0x036CbD53842c5426634e7929541eC2318f3dCF7e', decimals: 6 },
  { id: 'base-eth', label: 'ETH', where: 'Base', mode: 'send', chainId: 84532, symbol: 'ETH', kind: 'native' as const, decimals: 18 },
  { id: 'arc-usdc', label: 'USDC', where: 'Arc', mode: 'send', chainId: 5042002, symbol: 'USDC', kind: 'native' as const, decimals: 18 },
  { id: 'swap-base', label: 'Swap to ETH', where: 'Base', mode: 'swap', chain: 'base' },
  { id: 'bridge-out', label: 'Bridge', where: 'Base to Arc', mode: 'bridge', from: 'base', to: 'arc' },
  { id: 'bridge-back', label: 'Bridge', where: 'Arc to Base', mode: 'bridge', from: 'arc', to: 'base' },
  { id: 'dep-hood', label: 'Deposit USDG', where: 'Robinhood', mode: 'deposit', chain: 'robinhood-testnet' },
  { id: 'dep-base', label: 'Deposit USDC', where: 'Base', mode: 'deposit', chain: 'base' },
  { id: 'dep-arc', label: 'Deposit USDC', where: 'Arc', mode: 'deposit', chain: 'arc' },
]

function moveById(id: string) {
  return MOVES.find((item) => item.id === id) || MOVES[0]
}
import type { ChatMessage } from '../types'

interface Props {
  messages: ChatMessage[]
  setMessages: React.Dispatch<React.SetStateAction<ChatMessage[]>>
  userAddress: string
  userId: string
  onActionSuccess?: () => void
}

function plainReason(reason?: string) {
  if (!reason) return 'That did not go through. Nothing else was moved.'
  if (/appendSpend|is not defined|Cannot read propert/i.test(reason)) {
    return 'That did not finish. Check Account before you try again.'
  }
  return reason
}

function ProofBadge({ requestId }: { requestId: string }) {
  return (
    <div style={{ marginTop: 10, paddingTop: 8, borderTop: '1px solid var(--border)', fontSize: 12, color: 'var(--muted)' }}>
      <div style={{ letterSpacing: '0.12em', textTransform: 'uppercase', fontSize: 11, marginBottom: 4 }}>Request</div>
      <div>{requestId.slice(0, 24)}...</div>
    </div>
  )
}

function TxBadge({ result, onConfirm, onCancel }: { result?: any, onConfirm?: () => void, onCancel?: () => void }) {
  const [confirming, setConfirming] = React.useState(false)
  if (!result) return null
  const isProposal = result.status === 'proposing_pay' || result.status === 'proposing_schedule' || result.status === 'proposing_deposit' || result.status === 'proposing_swap' || result.status === 'proposing_bridge' || result.status === 'proposing_transfer' || result.status === 'proposing_mint' || result.status === 'proposing_pool_spend' || result.status === 'proposing_pool_create' || result.status === 'proposing_pool_contribute'
  if (isProposal) {
    let title = 'Check this'
    let detail = ''
    if (result.status === 'proposing_pay') { title = `Send ${result.amount} USDC`; detail = `To ${result.to}` }
    else if (result.status === 'proposing_schedule') { title = `Repeat ${result.amount} USDC`; detail = `To ${result.to}, every ${result.interval}` }
    else if (result.status === 'proposing_deposit') { title = `Deposit ${result.amount} ${result.token || 'USDC'}`; detail = `Into your vault on ${result.chainName || 'Arc'}` }
    else if (result.status === 'proposing_swap') { title = `Swap ${result.amount} ${result.fromAsset}`; detail = `You get about ${result.amountOut} ${result.toAsset} on ${result.chainName}` }
    else if (result.status === 'proposing_bridge') { title = `Bridge ${result.amount} USDC`; detail = `${result.fromName} to ${result.toName}. This leaves the wallet, not the vault.` }
    else if (result.status === 'proposing_transfer') { title = `Send ${result.amount} ${result.token}`; detail = `From your wallet to ${result.to}.` }
    else if (result.status === 'proposing_mint') { title = 'Deposit 100 test USDG'; detail = 'From the USDG already in your wallet.' }
    else if (result.status === 'proposing_pool_spend') { title = `Propose ${result.amount} USDC`; detail = `From the pool to ${result.to}. Signing starts the objection window. Nothing is sent until that window closes.` }
    else if (result.status === 'proposing_pool_create') { title = `Create ${result.name}`; detail = 'This is signed by your wallet. Nothing is created until you confirm.' }
    else if (result.status === 'proposing_pool_contribute') { title = `Contribute ${result.amount} USDC`; detail = `To ${result.name}. Your wallet approves it, then sends it.` }
    return (
      <div className="confirm-slip">
        <div className="confirm-title">{title}</div>
        <div className="confirm-detail">{detail}</div>
        <div className="confirm-actions">
          <button type="button" className="ink-btn" disabled={confirming} onClick={async () => { setConfirming(true); if (onConfirm) await onConfirm(); setConfirming(false) }}>
            {confirming ? 'Sending' : String(result.status).startsWith('proposing_pool') ? 'Sign' : 'Confirm'}
          </button>
          <button type="button" className="ghost-btn" disabled={confirming} onClick={onCancel}>Cancel</button>
        </div>
      </div>
    )
  }
  if (result.status === 'burned') {
    return (
      <div style={{ marginTop: 10, fontSize: 14 }}>
        <div>Sent on {result.fromName}. Arc has not received it yet.</div>
        {result.txHash && <div style={{ color: 'var(--muted)', marginTop: 4 }}>{result.txHash.slice(0, 18)}…</div>}
        <div style={{ color: 'var(--muted)', marginTop: 4 }}>It will show up on its own. Do not bridge it again.</div>
      </div>
    )
  }
  if (result.status === 'executed' || result.status === 'success') {
    let label = 'Done'
    if (result.type === 'bridge') label = `Bridged ${result.amount} USDC to ${result.toName}`
    else if (result.type === 'pool') label = `Proposed ${result.amount} USDC. It waits for objections.`
    else if (result.type === 'pool_create') label = `Created ${result.name}`
    else if (result.type === 'pool_contribute') label = `Contributed ${result.amount} USDC`
    else if (result.type === 'mint') label = 'Deposited 100 test USDG'
    else if (result.type === 'deposit') label = `Deposited ${result.amount} USDC`
    else if (result.type === 'schedule') label = `Scheduled ${result.amount} USDC`
    else if (result.amount) label = `Sent ${result.amount} ${result.token || 'USDC'}`
    return (
      <div style={{ marginTop: 10, fontSize: 14 }}>
        <div>{label}</div>
        {result.txHash && <div style={{ color: 'var(--muted)', marginTop: 4 }}>{String(result.txHash).slice(0, 18)}…</div>}
      </div>
    )
  }
  if (result.status === 'cancelled') return <div style={{ marginTop: 10, fontSize: 14, color: 'var(--muted)' }}>Cancelled. Nothing moved.</div>
  if (result.status === 'rejected') return <div style={{ marginTop: 10, fontSize: 14, color: 'var(--danger)' }}>{plainReason(result.reason)}</div>
  if (result.status === 'policy_updated') return <div style={{ marginTop: 10, fontSize: 14 }}>Limits updated.</div>
  if (result.status === 'failed') return <div style={{ marginTop: 10, fontSize: 14, color: 'var(--danger)' }}>{plainReason(result.reason)}</div>
  return null
}
function BalanceCard({ data }: { data: any }) {
  if (!data?.balances) return null
  return (
    <div style={{ marginTop: 12 }}>
      {Object.entries(data.balances).map(([token, amt]) => (
        <div key={token} style={{ display: 'flex', justifyContent: 'space-between', gap: 24, padding: '6px 0', borderTop: '1px solid var(--border)', fontFamily: 'var(--font-body)', fontSize: 14 }}>
          <span style={{ color: 'var(--muted)' }}>{token}</span>
          <span style={{ fontVariantNumeric: 'tabular-nums' }}>{String(amt)}{token.startsWith('Robinhood') ? '' : ' USDC'}</span>
        </div>
      ))}
    </div>
  )
}

function PolicyCard({ data }: { data: any }) {
  if (!data?.perTxCap) return null
  return (
    <div style={{ marginTop: 10, borderTop: '1px solid var(--border)', paddingTop: 10, fontSize: 14 }}>
      <div style={{ letterSpacing: '0.12em', textTransform: 'uppercase', color: 'var(--muted)', fontSize: 11, marginBottom: 8 }}>Limits</div>
      {[['Per transfer', `${data.perTxCap} USDC`], ['Daily cap', `${data.dailyCap} USDC`], ['Spent today', `${data.dailySpendSoFar} USDC`], ['Remaining', `${data.dailyRemaining} USDC`], ['Status', data.active ? 'Active' : 'Paused']].map(([k, v]) => (
        <div key={k} style={{ display: 'flex', justifyContent: 'space-between', gap: 16, padding: '6px 0', borderBottom: '1px solid var(--border)' }}>
          <span style={{ color: 'var(--muted)' }}>{k}</span>
          <span>{v}</span>
        </div>
      ))}
    </div>
  )
}

export default function Terminal({ messages, setMessages, userAddress, userId, onActionSuccess }: Props) {
  const { wallets } = useWallets()
  const [amount, setAmount] = React.useState('')
  const [who, setWho] = React.useState('')
  const [want, setWant] = React.useState('hood-usdg')
  const [where, setWhere] = React.useState('')
  const [input, setInput] = React.useState('')
  const [loading, setLoading] = React.useState(false)
  const [panel, setPanel] = React.useState(false)
  const [chain, setChain] = React.useState('Robinhood')
  const [txResults, setTxResultsRaw] = React.useState<Record<number, any>>({})

  const setTxResults = React.useCallback((updater: Record<number, any> | ((prev: Record<number, any>) => Record<number, any>)) => {
    setTxResultsRaw(prev => {
      const next = typeof updater === 'function' ? updater(prev) : updater
      const changedIndices = Object.keys(next).filter(k => next[Number(k)] !== prev[Number(k)])
      if (changedIndices.length > 0) {
        setMessages(prevMsgs => {
          const updated = [...prevMsgs]
          changedIndices.forEach(k => { const idx = Number(k); if (updated[idx]) updated[idx] = { ...updated[idx], result: next[idx] } })
          return updated
        })
      }
      return next
    })
  }, [setMessages])

  const scrollRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)

  useEffect(() => {
    if (!userAddress) return
    if (messages.length > 1) return
    getChatHistory(userId).then(res => {
      if (res.history?.length > 0) {
        const filtered = res.history.filter((m: any) => {
          if (m.role !== 'assistant') return true
          return !m.content?.startsWith("Your current balances") && !m.content?.startsWith("Your current Vault") && !m.content?.startsWith("Your spending policy")
        })
        setMessages(filtered.map((m: any) => ({ ...m, timestamp: m.timestamp || Date.now() })))
      }
    }).catch(() => {})
  }, [userAddress])

  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight
  }, [messages, loading])

  useEffect(() => {
    if (!userId) return
    getVaultBalanceApi(userId).then((res) => {
      const hood = res.chains?.find((c) => c.id === 'robinhood-testnet')
      if (hood) {
        setWhere(`${hood.eth} ETH · Robinhood`)
        return
      }
      const base = res.chains?.find((c) => c.id === 'base')
      if (!base) return
      setWhere(`${Number(base.wallet || 0).toFixed(2)} in your Base wallet · ${Number(base.vault || 0).toFixed(2)} in the vault`)
    }).catch(() => {})
  }, [userId, messages.length])

  function parseInterval(str: string) {
    if (!str) return 86400
    const s = str.toLowerCase()
    if (s.includes('minute')) return (parseInt(s) || 1) * 60
    if (s.includes('hour')) return (parseInt(s) || 1) * 3600
    if (s.includes('day')) return (parseInt(s) || 1) * 86400
    if (s.includes('week')) return (parseInt(s) || 1) * 604800
    return 86400
  }
  async function handleConfirm(msgIdx: number) {
    const prop = txResults[msgIdx]
    if (!prop) return
    try {
      let res
      if (prop.status === 'proposing_pay') {
        if (prop.to && prop.to.startsWith('0x')) {
          const chain = prop.chain === 'base' ? 'base' : 'arc'
          const paid = await sendUsdc(wallets, chain, Number(prop.amount), prop.to)
          res = { status: 'executed', txHash: paid.txHash, explorer: paid.explorer, type: 'pay', to: prop.to, amount: prop.amount, token: 'USDC' }
        } else {
          const requestId = generateRequestId()
          const payRes = await executePay(prop.to, prop.amount, prop.reason || 'Chat payment', requestId, userId, prop.token || 'USDC')
          res = { ...payRes, type: 'pay', to: prop.to, amount: prop.amount, token: prop.token || 'USDC' }
        }
      } else if (prop.status === 'proposing_deposit' || prop.status === 'proposing_mint') {
        const api = await getVaultBalanceApi(userId)
        const chainKey = prop.chain || 'robinhood-testnet'
        const row = api.chains?.find((item) => item.id === chainKey)
        const tokenAddress = chainKey === 'base'
          ? '0x036CbD53842c5426634e7929541eC2318f3dCF7e'
          : chainKey === 'arc'
            ? '0x3600000000000000000000000000000000000000'
            : '0x42fa9A8085c0bc633Afa4e19a1f491db9a4dC0fE'
        const paid = await depositFromWallet(
          wallets,
          chainKey === 'base' ? 84532 : chainKey === 'arc' ? 5042002 : 46630,
          tokenAddress,
          6,
          row?.vaultAddress || '',
          prop.status === 'proposing_mint' ? 100 : Number(prop.amount),
        )
        res = { status: 'executed', txHash: paid.txHash, explorer: paid.explorer, type: 'deposit', amount: prop.amount || 100, chainName: prop.chainName }
      } else if (prop.status === 'proposing_schedule') {
        const intervalSec = parseInterval(prop.interval)
        const schedRes = await createOnChainSchedule(prop.to, prop.amount, intervalSec, prop.reason || '', userId, prop.conditions?.minBalance || 0)
        res = { status: 'executed', txHash: schedRes.txHash, explorer: schedRes.explorer, type: 'schedule', to: prop.to, amount: prop.amount }
      } else if (prop.status === 'proposing_swap') {
        const quoted = await quoteSwap({
          fromAsset: prop.fromAsset,
          toAsset: prop.toAsset,
          amount: prop.amount,
          chain: prop.chain,
        }, userId)
        if (!quoted.success) throw new Error(quoted.reason || 'No swap quote.')
        const swapped = await swapFromWallet(wallets, quoted.quote)
        res = {
          status: 'executed',
          txHash: swapped.txHash,
          explorer: swapped.explorer,
          type: 'swap',
          amount: prop.amount,
          amountOut: quoted.quote.amountOut,
          fromAsset: prop.fromAsset,
          toAsset: prop.toAsset,
          chainName: prop.chainName,
        }
      } else if (prop.status === 'proposing_transfer') {
        const sent = await sendFromWallet(wallets, {
          chainId: prop.chainId,
          symbol: prop.token,
          kind: prop.kind,
          address: prop.tokenAddress,
          decimals: prop.decimals,
        }, Number(prop.amount), prop.to)
        res = {
          status: 'executed',
          txHash: sent.txHash,
          explorer: sent.explorer,
          type: 'payment',
          amount: prop.amount,
          token: prop.token,
        }
      } else if (prop.status === 'proposing_bridge') {
        const quoted = await quoteBridge({ from: prop.from, to: prop.to, amount: Number(prop.amount) }, userId)
        if (!quoted.success) throw new Error(quoted.reason || 'No bridge quote.')
        const bridged = await bridgeFromWallet(wallets, {
          ...quoted.quote,
          token: quoted.quote.tokenAddress,
        })
        res = {
          status: bridged.status,
          txHash: bridged.txHash,
          explorer: bridged.explorer,
          type: 'bridge',
          amount: prop.amount,
          fromName: prop.fromName,
          toName: prop.toName,
        }
      } else if (prop.status === 'proposing_pool_spend') {
        const request = prop.signatureRequest
        const signer = await signerFor(wallets, Number(request.typedData.domain.chainId))
        const signature = await signer.signTypedData(request.typedData.domain, request.typedData.types, request.typedData.message)
        const proposed = await proposeSpendInPool(
          request.poolId,
          request.submit.to,
          request.submit.amount,
          request.submit.reason,
          userId,
          signature,
          request.typedData.message.deadline,
        )
        res = { status: 'executed', type: 'pool', amount: request.submit.amount, token: 'USDC', txHash: proposed.txHash }
      } else if (prop.status === 'proposing_pool_create') {
        const sent = await sendContractCall(wallets, prop.tx)
        const created = await createPool(prop.name, prop.invites, prop.constitution, userId, sent.txHash)
        if (!('poolId' in created)) throw new Error('The pool was not recorded.')
        res = { status: 'executed', type: 'pool_create', name: created.name, txHash: created.txHash }
      } else if (prop.status === 'proposing_pool_contribute') {
        if (prop.approve) await sendContractCall(wallets, prop.approve)
        const sent = await sendContractCall(wallets, prop.tx)
        const recorded = await contributeToPool(prop.poolId, prop.amount, prop.toShared !== false, userId, sent.txHash)
        if (!('success' in recorded)) throw new Error('The contribution was not recorded.')
        res = { status: 'executed', type: 'pool_contribute', amount: prop.amount, token: 'USDC', txHash: sent.txHash }
      }
      if (res) {
        setTxResults(r => ({ ...r, [msgIdx]: res }))
        if ((res.status === 'executed' || res.status === 'success') && onActionSuccess) setTimeout(() => onActionSuccess(), 3000)
      }
    } catch (err: any) {
      const decoded = decodePolicyError(err)
      setTxResults(r => ({ ...r, [msgIdx]: { status: 'failed', reason: decoded || err.message } }))
    }
  }

  function handleCancel(msgIdx: number) {
    setTxResults(r => ({ ...r, [msgIdx]: { status: 'cancelled' } }))
  }

  async function handleSend(overrideText?: string) {
    const text = (overrideText || input).trim()
    if (!text || loading) return
    if (text.toLowerCase() === 'clear') {
      await clearChatHistory(userId).catch(() => {})
      setMessages([{ role: 'assistant', content: 'Memory cleared.', timestamp: Date.now() }])
      setInput('')
      return
    }
    if (text.toLowerCase() === 'status') {
      const userMsg: ChatMessage = { role: 'user', content: text, timestamp: Date.now() }
      setMessages(prev => [...prev, userMsg])
      setInput('')
      getVaultBalanceApi(userId)
        .then(res => setMessages(prev => [...prev, { role: 'assistant', content: `Vault: ${res.balance} USDC — Worker online — Policy active`, timestamp: Date.now() }]))
        .catch(() => setMessages(prev => [...prev, { role: 'assistant', content: 'Failed to fetch status.', timestamp: Date.now() }]))
      return
    }
    const userMsg: ChatMessage = { role: 'user', content: text, timestamp: Date.now() }
    setMessages(prev => [...prev, userMsg])
    setInput('')
    setLoading(true)
    try {
      const res = await sendChat(text, userId)
      const intent = res.intent
      const assistantMsg: ChatMessage = { role: 'assistant', content: intent.message || 'Processing complete.', timestamp: Date.now(), intent: res.intent, data: res.data }
      setMessages(prev => {
        const next = [...prev, assistantMsg]
        const msgIndex = next.length - 1
        setTimeout(async () => {
          if (intent.action === 'pay' && intent.to && intent.amount) setTxResults(r => ({ ...r, [msgIndex]: { status: 'proposing_pay', to: intent.to, amount: intent.amount, token: 'USDC', reason: intent.reason } }))
          if (intent.action === 'deposit' && intent.amount) {
            const chain = intent.chain || 'arc'
            const chainName = chain === 'base' ? 'Base Sepolia' : chain === 'robinhood' || chain === 'robinhood-testnet' ? 'Robinhood testnet' : 'Arc'
            const token = chainName.startsWith('Robinhood') ? 'TSLA' : 'USDC'
            setTxResults(r => ({ ...r, [msgIndex]: { status: 'proposing_deposit', amount: intent.amount, chain, chainName, token } }))
          }
          if (intent.action === 'schedule' && intent.to && intent.amount && intent.interval) setTxResults(r => ({ ...r, [msgIndex]: { status: 'proposing_schedule', to: intent.to, amount: intent.amount, interval: intent.interval, reason: intent.reason, conditions: intent.conditions } }))
          if (intent.action === 'swap' && intent.data?.quote) {
            const q = intent.data.quote
            setTxResults(r => ({ ...r, [msgIndex]: { status: 'proposing_swap', fromAsset: q.from, toAsset: q.to, amount: q.amountIn, amountOut: q.amountOut, chain: q.chain, chainName: q.chainName } }))
          }
          if (intent.action === 'bridge' && intent.data?.quote) {
            const q = intent.data.quote
            setTxResults(r => ({ ...r, [msgIndex]: { status: 'proposing_bridge', amount: q.amount, from: q.from, to: q.to, fromName: q.fromName, toName: q.toName } }))
          }
          if (intent.action === 'pool_propose_spend' && intent.data?.signatureRequest && intent.data.poolId) {
            const request = intent.data.signatureRequest
            const poolId = intent.data.poolId
            setTxResults(r => ({ ...r, [msgIndex]: { status: 'proposing_pool_spend', amount: request.submit.amount, to: request.submit.to, signatureRequest: { ...request, poolId } } }))
          }
          if (intent.action === 'create_pool' && intent.data?.poolCreate) {
            const draft = intent.data.poolCreate
            setTxResults(r => ({ ...r, [msgIndex]: { status: 'proposing_pool_create', name: draft.name, invites: draft.invites, constitution: draft.constitution, tx: draft.tx } }))
          }
          if (intent.action === 'pool_contribute' && intent.data?.poolContribute) {
            const draft = intent.data.poolContribute
            setTxResults(r => ({ ...r, [msgIndex]: { status: 'proposing_pool_contribute', name: draft.name, poolId: draft.poolId, amount: draft.amount, toShared: draft.toShared, approve: draft.approve, tx: draft.tx } }))
          }
          if (intent.action === 'update_policy' && intent.policyUpdate) {
            const up = intent.policyUpdate
            const applyPolicyUpdate = async () => {
              const current = await getPolicy(userId)
              const update: any = {}
              if (up.field === 'dailyCap') update.dailyCap = up.value
              if (up.field === 'perTxCap') update.perTxCap = up.value
              if (up.field === 'maxTxPerHour') update.maxTxPerHour = up.value
              if (up.field === 'activeHours') update.activeHours = { start: up.start, end: up.end }
              if (up.field === 'addWhitelist' && up.address) update.whitelist = [...new Set([...(current.whitelist || []), up.address])]
              if (up.field === 'removeWhitelist' && up.address) update.whitelist = (current.whitelist || []).filter((a: string) => a.toLowerCase() !== up.address?.toLowerCase())
              return await updatePolicy(update, userId)
            }
            applyPolicyUpdate()
              .then(() => { setTxResults(r => ({ ...r, [msgIndex]: { status: 'policy_updated' } })); if (onActionSuccess) onActionSuccess() })
              .catch(err => setTxResults(r => ({ ...r, [msgIndex]: { status: 'failed', reason: err.message } })))
          }
          if (intent.action === 'fetch_and_pay') {
            const chatRes: any = res
            if (chatRes.result) setTxResults(prev => ({ ...prev, [msgIndex]: chatRes.result.success ? { status: 'executed', type: 'fetch', to: chatRes.result.actualPayTo || intent.url, amount: chatRes.result.actualAmount || intent.maxAmount, txHash: 'x402' } : { status: 'rejected', reason: chatRes.result.reason || 'fetch failed' } }))
          }
        }, 0)
        return next
      })
    } catch (err: any) {
      setMessages(prev => [...prev, { role: 'assistant', content: 'Connection error: ' + err.message, timestamp: Date.now() }])
    } finally {
      setLoading(false)
      inputRef.current?.focus()
    }
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend() }
  }

  function submitMove() {
    const n = Number(amount)
    if (!Number.isFinite(n) || n <= 0) return
    const move = moveById(want)
    setAmount('')
    if (move.mode === 'swap') {
      handleSend(`Swap ${n} USDC for ETH on Base Sepolia`)
      return
    }
    if (move.mode === 'bridge') {
      const userMsg = { role: 'user' as const, content: `Bridge ${n} USDC, ${move.where}`, timestamp: Date.now() }
      const assistantMsg = { role: 'assistant' as const, content: `Bridge ${n} USDC, ${move.where}.`, timestamp: Date.now() }
      setMessages((prev) => {
        const next = [...prev, userMsg, assistantMsg]
        const idx = next.length - 1
        setTimeout(() => setTxResults((r) => ({ ...r, [idx]: { status: 'proposing_bridge', amount: n, from: move.from, to: move.to, fromName: String(move.where).split(' to ')[0], toName: String(move.where).split(' to ')[1] } })), 0)
        return next
      })
      return
    }
    if (move.mode === 'deposit') {
      const userMsg = { role: 'user' as const, content: `Deposit ${n} on ${move.where}`, timestamp: Date.now() }
      const assistantMsg = { role: 'assistant' as const, content: `Deposit ${n} into the vault on ${move.where}.`, timestamp: Date.now() }
      setMessages((prev) => {
        const next = [...prev, userMsg, assistantMsg]
        const idx = next.length - 1
        setTimeout(() => setTxResults((r) => ({ ...r, [idx]: { status: 'proposing_deposit', amount: n, chain: move.chain, chainName: move.where } })), 0)
        return next
      })
      return
    }
    if (!who.trim()) return
    const userMsg = { role: 'user' as const, content: `Send ${n} ${move.symbol} on ${move.where} to ${who.trim()}`, timestamp: Date.now() }
    const assistantMsg = { role: 'assistant' as const, content: `Send ${n} ${move.symbol} from your ${move.where} wallet.`, timestamp: Date.now() }
    setMessages((prev) => {
      const next = [...prev, userMsg, assistantMsg]
      const idx = next.length - 1
      setTimeout(() => {
        setTxResults((r) => ({ ...r, [idx]: { status: 'proposing_transfer', amount: n, token: move.symbol, to: who.trim(), chainId: move.chainId, kind: move.kind, tokenAddress: move.address, decimals: move.decimals } }))
      }, 0)
      return next
    })
    setWho('')
  }

  const selected = moveById(want)
  const routeLine = selected.mode === 'swap'
    ? 'Swaps your Base USDC for ETH.'
    : selected.mode === 'bridge'
      ? `Bridges USDC, ${selected.where}.`
      : selected.mode === 'deposit'
        ? `Deposits into the vault on ${selected.where}.`
        : `Sends ${selected.symbol} from your ${selected.where} wallet.`

  function chooseChain(name: string) {
    setChain(name)
    const first = MOVES.find((move) => move.where === name || String(move.where).startsWith(name))
    if (first) setWant(first.id)
  }

  const chainMoves = MOVES.filter((move) => move.where === chain || String(move.where).startsWith(chain))

  if (!userAddress) return (
    <div className="terminal">
      <div className="messages">
        <div className="message assistant">
          <div className="message-bubble">Connect your wallet to get started.</div>
        </div>
      </div>
    </div>
  )

  return (
    <div className="terminal">
      {where && <div className="term-where">{where}</div>}
      <div className="messages" ref={scrollRef}>
        {messages.length === 0 && (
          <div className="message assistant">
            <div className="message-bubble" style={{ color: 'var(--muted)' }}>Say what to do. Nothing moves until you confirm.</div>
          </div>
        )}
        {messages.map((msg, i) => (
          <div key={i} className={`message ${msg.role}`}>
            <div className="message-bubble">
              {msg.content}
              {msg.role === 'assistant' && msg.intent?.requestId && <ProofBadge requestId={msg.intent.requestId} />}
              {msg.role === 'assistant' && (msg as any).data && (msg as any).intent?.action === 'balance' && <BalanceCard data={(msg as any).data} />}
              {msg.role === 'assistant' && (msg as any).data && (msg as any).intent?.action === 'policy' && <PolicyCard data={(msg as any).data} />}
              {msg.role === 'assistant' && (txResults[i] || (msg as any).result) && (
                <div style={{ marginTop: 8 }}>
                  <TxBadge result={txResults[i] || (msg as any).result} onConfirm={() => handleConfirm(i)} onCancel={() => handleCancel(i)} />
                </div>
              )}
            </div>
          </div>
        ))}
        {loading && (
          <div className="message assistant">
            <div style={{ fontSize: 12, color: 'var(--muted)', marginBottom: 4 }}>Working</div>
            <div className="typing"><span /><span /><span /></div>
          </div>
        )}
      </div>
      {panel && (
        <div className="term-panel">
          <div className="term-chains">
            {['Robinhood', 'Base', 'Arc'].map((name) => (
              <button key={name} type="button" className={chain === name ? 'on' : ''} onClick={() => chooseChain(name)}>{name}</button>
            ))}
          </div>
          <div className="term-assets">
            {chainMoves.map((move) => (
              <button key={move.id} type="button" disabled={loading} onClick={() => setWant(move.id)} className={want === move.id ? 'move-chip on' : 'move-chip'} aria-pressed={want === move.id}>
                {move.label}
              </button>
            ))}
            {chain === 'Robinhood' && (
              <button type="button" disabled={loading} className="term-quiet" onClick={() => {
                const userMsg = { role: 'user' as const, content: 'Deposit 100 of my test USDG', timestamp: Date.now() }
                const assistantMsg = { role: 'assistant' as const, content: 'Deposit 100 from the USDG already in the wallet.', timestamp: Date.now() }
                setMessages((prev) => {
                  const next = [...prev, userMsg, assistantMsg]
                  const idx = next.length - 1
                  setTimeout(() => setTxResults((r) => ({ ...r, [idx]: { status: 'proposing_mint' } })), 0)
                  return next
                })
                setPanel(false)
              }}>Deposit 100</button>
            )}
          </div>
          <div style={{ color: 'var(--muted)', fontSize: 12, margin: '4px 0 2px' }}>{routeLine}</div>
          <input inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="Amount" style={fieldStyle} />
          {selected.mode === 'send' && <input value={who} onChange={(e) => setWho(e.target.value)} placeholder="Recipient address" style={fieldStyle} />}
          <button type="button" onClick={submitMove} disabled={loading} className="ink-btn" style={{ marginTop: 12, width: '100%', minHeight: 44 }}>
            Review
          </button>
        </div>
      )}
      <div className="input-area">
        <button type="button" className={panel ? 'move-chip on' : 'move-chip'} onClick={() => setPanel((open) => !open)}>{panel ? 'Close' : 'Send'}</button>
        <textarea ref={inputRef} className="chat-input" placeholder="Say what to do" value={input} onChange={(e) => { setInput(e.target.value); e.target.style.height = 'auto'; e.target.style.height = e.target.scrollHeight + 'px' }} onKeyDown={handleKeyDown} rows={1} disabled={loading} style={{ maxHeight: '100px', fontSize: 15 }} />
        <button className="send-btn icon-btn" onClick={() => handleSend()} disabled={loading || !input.trim()}>Go</button>
      </div>
    </div>
  )
}

const fieldStyle: React.CSSProperties = {
  width: '100%',
  background: 'transparent',
  border: 'none',
  borderBottom: '1px solid var(--border)',
  color: 'var(--text)',
  font: 'inherit',
  fontSize: 16,
  padding: '10px 0',
  outline: 'none',
  borderRadius: 0,
}

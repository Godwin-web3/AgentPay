import React, { useRef, useEffect } from 'react'
import { sendChat, executePay, generateRequestId, getPolicy, updatePolicy, getChatHistory, clearChatHistory, getVaultBalanceApi, createOnChainSchedule, hireAgent, decodePolicyError, depositToVault, getJob } from '../api'
import type { ChatMessage } from '../types'

interface Props {
  messages: ChatMessage[]
  setMessages: React.Dispatch<React.SetStateAction<ChatMessage[]>>
  userAddress: string
  userId: string
  onActionSuccess?: () => void
}

function formatTime(ts: number) {
  return new Date(ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
}

function ProofBadge({ requestId }: { requestId: string }) {
  return (
    <div style={{ marginTop: 10, padding: '6px 10px', background: 'rgba(79,219,200,0.04)', border: '1px solid rgba(79,219,200,0.15)', fontSize: 10, fontFamily: 'var(--font-mono)', color: 'var(--muted)', display: 'flex', alignItems: 'center', gap: 8 }}>
      <div>
        <div style={{ color: 'var(--cyan)', marginBottom: 2, letterSpacing: 1 }}>REQUEST ID</div>
        <div>{requestId.slice(0, 24)}...</div>
      </div>
    </div>
  )
}

function TxBadge({ result, onConfirm, onCancel }: { result?: any, onConfirm?: () => void, onCancel?: () => void }) {
  const [confirming, setConfirming] = React.useState(false)
  if (!result) return null
  const isProposal = result.status === 'proposing_pay' || result.status === 'proposing_schedule' || result.status === 'proposing_hire' || result.status === 'proposing_deposit'
  if (isProposal) {
    let title = 'TX PROPOSAL'
    let detail = ''
    if (result.status === 'proposing_pay') { title = 'PAYMENT PROPOSAL'; detail = `${result.amount} ${result.token || 'USDC'} -> ${result.to?.slice(0, 10)}...` }
    else if (result.status === 'proposing_schedule') { title = 'SCHEDULE PAYMENT'; detail = `${result.amount} USDC to ${result.to?.slice(0, 10)}... / ${result.interval}` }
    else if (result.status === 'proposing_hire') { title = 'HIRE AGENT'; detail = `${result.description} — budget ${result.budget} USDC` }
    else if (result.status === 'proposing_deposit') { title = 'VAULT DEPOSIT'; detail = `${result.amount} USDC` }
    return (
      <div style={{ marginTop: 10, border: '1px solid var(--cyan)', background: 'rgba(79,219,200,0.04)', padding: '12px 14px', fontFamily: 'var(--font-mono)' }}>
        <div style={{ fontSize: 9, color: 'var(--cyan)', letterSpacing: 2, marginBottom: 6 }}>{title}</div>
        <div style={{ fontSize: 12, color: 'var(--text)', marginBottom: 12 }}>{detail}</div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button disabled={confirming} onClick={async () => { setConfirming(true); if (onConfirm) await onConfirm(); setConfirming(false) }} style={{ flex: 2, background: 'var(--cyan)', color: '#000', border: 'none', padding: '8px 12px', fontSize: 11, cursor: 'pointer', fontFamily: 'var(--font-mono)', fontWeight: 700, letterSpacing: 1 }}>
            {confirming ? 'EXECUTING...' : 'CONFIRM'}
          </button>
          <button disabled={confirming} onClick={onCancel} style={{ flex: 1, background: 'transparent', color: 'var(--muted)', border: '1px solid var(--border)', padding: '8px 12px', fontSize: 11, cursor: 'pointer', fontFamily: 'var(--font-mono)' }}>
            CANCEL
          </button>
        </div>
      </div>
    )
  }
  if (result.status === 'executed' || result.status === 'success') {
    let label = 'EXECUTED'
    if (result.type === 'schedule') label = `SCHEDULED — ${result.amount} ${result.token || 'USDC'} to ${result.to?.slice(0, 10)}...`
    else if (result.type === 'pay' || result.to) label = `SENT — ${result.amount} ${result.token || 'USDC'} to ${result.to?.slice(0, 10)}...`
    else if (result.type === 'deposit') label = `DEPOSITED — ${result.amount} USDC`
    return (
      <div style={{ marginTop: 10 }}>
        <a href={result.explorer} target="_blank" rel="noreferrer" style={{ display: 'block', textDecoration: 'none', fontFamily: 'var(--font-mono)', fontSize: 11, padding: '10px 14px', border: '1px solid rgba(79,219,200,0.3)', background: 'rgba(79,219,200,0.04)', color: 'var(--cyan)' }}>
          <div style={{ letterSpacing: 1, marginBottom: 4 }}>+ {label}</div>
          {result.txHash && <div style={{ fontSize: 10, color: 'var(--muted)' }}>TX {result.txHash.slice(0, 18)}... -&gt;</div>}
          <div style={{ marginTop: 4, fontSize: 9, color: 'var(--muted)', letterSpacing: 1 }}>FINALIZED IN &lt; 1s — ARC TESTNET</div>
        </a>
        {result.type === 'hire' && !result.deliverableText && (
          <div style={{ marginTop: 6, fontSize: 10, color: 'var(--muted)', fontFamily: 'var(--font-mono)', padding: '8px 14px' }}>
            Waiting for delivery...
          </div>
        )}
        {result.deliverableText && (
          <div style={{ marginTop: 6, fontSize: 12, color: 'var(--text)', fontFamily: 'var(--font-body)', padding: '10px 14px', border: '1px solid var(--border)', background: 'var(--bg-card)', whiteSpace: 'pre-wrap' }}>
            {result.deliverableText}
          </div>
        )}
      </div>
    )
  }
  if (result.status === 'cancelled') return <div style={{ marginTop: 10, fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--muted)', padding: '8px 0' }}>CANCELLED</div>
  if (result.status === 'rejected') return <div style={{ marginTop: 10, fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--danger)', padding: '10px 14px', border: '1px solid rgba(255,59,92,0.2)', background: 'rgba(255,59,92,0.04)' }}>BLOCKED — {result.reason}</div>
  if (result.status === 'policy_updated') return <div style={{ marginTop: 10, fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--cyan)', padding: '10px 14px', border: '1px solid rgba(79,219,200,0.2)' }}>POLICY UPDATED</div>
  if (result.status === 'failed') return <div style={{ marginTop: 10, fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--warning)', padding: '10px 14px', border: '1px solid rgba(255,107,53,0.2)', background: 'rgba(255,107,53,0.04)' }}>ERROR — {result.reason}</div>
  return null
}
function BalanceCard({ data }: { data: any }) {
  if (!data?.balances) return null
  return (
    <div style={{ marginTop: 10, border: '1px solid var(--border)', padding: '12px 14px', fontFamily: 'var(--font-mono)', fontSize: 12 }}>
      <div style={{ color: 'var(--cyan)', marginBottom: 8, fontSize: 9, letterSpacing: 2 }}>BALANCES</div>
      {Object.entries(data.balances).map(([token, amt]) => (
        <div key={token} style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
          <span style={{ color: 'var(--muted)' }}>{token}</span>
          <span>{String(amt)}</span>
        </div>
      ))}
      {data.vault && (
        <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 8, borderTop: '1px solid var(--border)', paddingTop: 8 }}>
          <span style={{ color: 'var(--muted)' }}>VAULT</span>
          <span style={{ color: 'var(--cyan)' }}>{data.vault} USDC</span>
        </div>
      )}
    </div>
  )
}

function PolicyCard({ data }: { data: any }) {
  if (!data?.perTxCap) return null
  return (
    <div style={{ marginTop: 10, border: '1px solid var(--border)', padding: '12px 14px', fontFamily: 'var(--font-mono)', fontSize: 12 }}>
      <div style={{ color: 'var(--cyan)', marginBottom: 8, fontSize: 9, letterSpacing: 2 }}>POLICY</div>
      {[['PER_TX_CAP', `${data.perTxCap} USDC`], ['DAILY_CAP', `${data.dailyCap} USDC`], ['SPENT_TODAY', `${data.dailySpendSoFar} USDC`], ['REMAINING', `${data.dailyRemaining} USDC`], ['STATUS', data.active ? 'ACTIVE' : 'PAUSED']].map(([k, v]) => (
        <div key={k} style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
          <span style={{ color: 'var(--muted)' }}>{k}</span>
          <span style={{ color: k === 'STATUS' ? (data.active ? 'var(--cyan)' : 'var(--danger)') : 'var(--text)' }}>{v}</span>
        </div>
      ))}
    </div>
  )
}

function MarketCard({ data }: { data: any }) {
  if (!data?.market) return null
  const m = data.market
  return (
    <div style={{ marginTop: 10, border: '1px solid var(--border)', padding: '12px 14px', fontFamily: 'var(--font-mono)', fontSize: 12 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
        <div style={{ fontSize: 9, color: 'var(--cyan)', letterSpacing: 2 }}>ARC JOB MARKET</div>
        <div style={{ fontSize: 9, color: 'var(--muted)' }}>LIVE</div>
      </div>
      {[['TOTAL_JOBS', m.totalJobs], ['AVG_BUDGET', m.averageBudget], ['TOTAL_VOLUME', m.totalVolumeUSDC + ' USDC'], ['OPEN', m.statusBreakdown?.Open || 0], ['COMPLETED', m.statusBreakdown?.Completed || 0]].map(([k, v]) => (
        <div key={String(k)} style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
          <span style={{ color: 'var(--muted)' }}>{k}</span>
          <span style={{ color: 'var(--text)' }}>{String(v)}</span>
        </div>
      ))}
      {m.topProviders?.length > 0 && (
        <div style={{ marginTop: 10, borderTop: '1px solid var(--border)', paddingTop: 10 }}>
          <div style={{ fontSize: 9, color: 'var(--muted)', letterSpacing: 1, marginBottom: 6 }}>TOP PROVIDERS</div>
          {m.topProviders.map((p: any) => (
            <div key={p.address} style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
              <span style={{ color: 'var(--muted)' }}>{p.address.slice(0, 12)}...</span>
              <span style={{ color: 'var(--cyan)' }}>{p.jobCount} jobs</span>
            </div>
          ))}
        </div>
      )}
      {data.recentJobs?.length > 0 && (
        <div style={{ marginTop: 10, borderTop: '1px solid var(--border)', paddingTop: 10 }}>
          <div style={{ fontSize: 9, color: 'var(--muted)', letterSpacing: 1, marginBottom: 6 }}>RECENT JOBS</div>
          {data.recentJobs.slice(0, 5).map((j: any) => (
            <div key={j.id} style={{ marginBottom: 8, paddingBottom: 8, borderBottom: '1px solid var(--border)' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 2 }}>
                <span style={{ color: 'var(--muted)', fontSize: 10 }}>#{j.id}</span>
                <span style={{ color: j.status === 'Completed' ? 'var(--cyan)' : j.status === 'Open' ? 'var(--warning)' : 'var(--muted)', fontSize: 10 }}>{j.status}</span>
              </div>
              <div style={{ fontSize: 11, color: 'var(--text)', marginBottom: 2 }}>{j.description}</div>
              <div style={{ fontSize: 10, color: 'var(--muted)' }}>{j.budget} USDC</div>
            </div>
          ))}
        </div>
      )}
      <div style={{ marginTop: 8, fontSize: 9, color: 'var(--muted)', borderTop: '1px solid var(--border)', paddingTop: 8 }}>
        PAID VIA X402 — 0.001 USDC — ARC TESTNET
      </div>
    </div>
  )
}

export default function Terminal({ messages, setMessages, userAddress, userId, onActionSuccess }: Props) {
  const [input, setInput] = React.useState('')
  const [loading, setLoading] = React.useState(false)
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
        const requestId = generateRequestId()
        const payRes = await executePay(prop.to, prop.amount, prop.reason || 'Chat payment', requestId, userId, prop.token || 'USDC')
        res = { ...payRes, type: 'pay', to: prop.to, amount: prop.amount, token: prop.token || 'USDC' }
      } else if (prop.status === 'proposing_deposit') {
        const depRes = await depositToVault(String(prop.amount), userId)
        res = { status: depRes.success ? 'executed' : 'failed', txHash: depRes.txHash, explorer: depRes.explorer, type: 'deposit', amount: prop.amount }
      } else if (prop.status === 'proposing_schedule') {
        const intervalSec = parseInterval(prop.interval)
        const schedRes = await createOnChainSchedule(prop.to, prop.amount, intervalSec, prop.reason || '', userId, prop.conditions?.minBalance || 0)
        res = { status: 'executed', txHash: schedRes.txHash, explorer: schedRes.explorer, type: 'schedule', to: prop.to, amount: prop.amount }
      } else if (prop.status === 'proposing_hire') {
        const hireRes = await hireAgent(prop.description, prop.budget, userId)
        res = { status: hireRes.success ? 'executed' : 'rejected', txHash: hireRes.fundTxHash || hireRes.createTxHash, explorer: 'https://testnet.arcscan.app/tx/' + (hireRes.fundTxHash || hireRes.createTxHash || ''), type: 'hire', to: prop.to, amount: prop.budget, reason: hireRes.reason || '', jobId: hireRes.jobId }
        if (hireRes.success && hireRes.jobId) {
          const poll = async (attempt: number) => {
            if (attempt > 20) return
            try {
              const job = await getJob(hireRes.jobId, userId)
              if (job.deliverableText) {
                setTxResults(r => ({ ...r, [msgIdx]: { ...r[msgIdx], deliverableText: job.deliverableText } }))
                return
              }
            } catch {}
            setTimeout(() => poll(attempt + 1), 4000)
          }
          setTimeout(() => poll(0), 4000)
        }
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
    if (text.toLowerCase() === '/market' || text.toLowerCase() === 'market') {
      const userMsg: ChatMessage = { role: 'user', content: text, timestamp: Date.now() }
      setMessages(prev => [...prev, userMsg])
      setInput('')
      setLoading(true)
      try {
        const apiBase = import.meta.env.VITE_API_URL || 'https://agentpay-c4o7.onrender.com'
        setMessages(prev => [...prev, { role: 'assistant', content: 'Fetching Arc job market...\nEndpoint requires 0.001 USDC — agent paying via x402...', timestamp: Date.now() }])
        const marketRes = await fetch(`${apiBase}/market-intel`, {
          headers: { 'x-user-id': userId, 'x-api-key': import.meta.env.VITE_APP_API_KEY || '' }
        })
        const marketData = await marketRes.json()
        setMessages(prev => [...prev, { role: 'assistant', content: 'Arc job market intelligence — paid via x402', timestamp: Date.now(), data: marketData, intent: { action: 'market' } as any }])
      } catch (err: any) {
        setMessages(prev => [...prev, { role: 'assistant', content: 'Market fetch failed: ' + err.message, timestamp: Date.now() }])
      } finally {
        setLoading(false)
      }
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
          if (intent.action === 'deposit' && intent.amount) setTxResults(r => ({ ...r, [msgIndex]: { status: 'proposing_deposit', amount: intent.amount } }))
          if (intent.action === 'schedule' && intent.to && intent.amount && intent.interval) setTxResults(r => ({ ...r, [msgIndex]: { status: 'proposing_schedule', to: intent.to, amount: intent.amount, interval: intent.interval, reason: intent.reason, conditions: intent.conditions } }))
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
          if (intent.action === 'hire_agent' && intent.description) setTxResults(r => ({ ...r, [msgIndex]: { status: 'proposing_hire', description: intent.description, budget: intent.budget || 0, to: intent.to } }))
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
      <div className="messages" ref={scrollRef}>
        {messages.map((msg, i) => (
          <div key={i} className={`message ${msg.role}`}>
            <div style={{ fontSize: 9, letterSpacing: 1, marginBottom: 4, color: msg.role === 'user' ? 'var(--muted)' : 'var(--cyan)', fontFamily: 'var(--font-mono)', textAlign: msg.role === 'user' ? 'right' : 'left' }}>
              {msg.role === 'user' ? 'YOU' : 'AP'} — {formatTime(msg.timestamp)}
            </div>
            <div className="message-bubble">
              {msg.content}
              {msg.role === 'assistant' && msg.intent?.requestId && <ProofBadge requestId={msg.intent.requestId} />}
              {msg.role === 'assistant' && (msg as any).data && (msg as any).intent?.action === 'balance' && <BalanceCard data={(msg as any).data} />}
              {msg.role === 'assistant' && (msg as any).data && (msg as any).intent?.action === 'policy' && <PolicyCard data={(msg as any).data} />}
              {msg.role === 'assistant' && (msg as any).data && (msg as any).intent?.action === 'market' && <MarketCard data={(msg as any).data} />}
              {msg.role === 'assistant' && (txResults[i] || (msg as any).result) && (
                <div style={{ marginTop: 10 }}>
                  <TxBadge result={txResults[i] || (msg as any).result} onConfirm={() => handleConfirm(i)} onCancel={() => handleCancel(i)} />
                </div>
              )}
            </div>
          </div>
        ))}
        {loading && (
          <div className="message assistant">
            <div style={{ fontSize: 9, letterSpacing: 1, marginBottom: 4, color: 'var(--cyan)', fontFamily: 'var(--font-mono)' }}>AP</div>
            <div className="typing"><span /><span /><span /></div>
          </div>
        )}
      </div>
      <div className="quick-actions">
        {[{ label: 'SEND', value: 'Send 1 USDC to ', auto: false }, { label: 'MARKET', value: '/market', auto: true }, { label: 'BALANCE', value: 'What is my vault balance?', auto: true }, { label: 'HIRE', value: 'Hire an agent to ', auto: false }].map(btn => (
          <button key={btn.label} className="quick-btn" disabled={loading} onClick={() => { if (btn.auto) { handleSend(btn.value) } else { setInput(btn.value); inputRef.current?.focus() } }}>
            {btn.label}
          </button>
        ))}
      </div>
      <div className="input-area">
        <textarea ref={inputRef} className="chat-input" placeholder="send, pay, hire, /market..." value={input} onChange={(e) => { setInput(e.target.value); e.target.style.height = 'auto'; e.target.style.height = e.target.scrollHeight + 'px' }} onKeyDown={handleKeyDown} rows={1} disabled={loading} style={{ maxHeight: '120px' }} />
        <button className="send-btn icon-btn" onClick={() => handleSend()} disabled={loading || !input.trim()}>SEND</button>
      </div>
    </div>
  )
}

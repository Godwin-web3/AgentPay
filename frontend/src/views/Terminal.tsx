import React, { useRef, useEffect } from 'react'
import { sendChat, executePay, generateRequestId, getPolicy, updatePolicy, getChatHistory, clearChatHistory, getVaultBalanceApi, createOnChainSchedule, hireAgent, decodePolicyError } from '../api'
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
    <div style={{
      marginTop: 8,
      padding: '6px 10px',
      background: 'rgba(0, 255, 255, 0.05)',
      border: '1px dashed var(--cyan)',
      fontSize: 10,
      fontFamily: 'var(--font-mono)',
      color: 'var(--muted)',
      display: 'flex',
      alignItems: 'center',
      gap: 8,
    }}>
      <span style={{ fontSize: 12 }}>🔗</span>
      <div>
        <div style={{ color: 'var(--cyan)', marginBottom: 2 }}>ON-CHAIN REQUEST ID</div>
        <div>{requestId.slice(0, 20)}...</div>
      </div>
    </div>
  )
}

function TxBadge({ result, onConfirm, onCancel }: { result?: any, onConfirm?: () => void, onCancel?: () => void }) {
  const [confirming, setConfirming] = React.useState(false)
  if (!result) return null
  
  const isProposal = result.status === 'proposing_pay' || result.status === 'proposing_schedule' || result.status === 'proposing_hire'

  if (isProposal) {
    let title = 'TX PROPOSAL'
    let detail = ''
    if (result.status === 'proposing_pay') {
      title = '💸 PAYMENT PROPOSAL'
      detail = `Send ${result.amount} ${result.token || 'USDC'} to ${result.to?.slice(0, 8)}...`
    } else if (result.status === 'proposing_schedule') {
      title = '⏰ ON-CHAIN SCHEDULE'
      detail = `Pay ${result.amount} USDC to ${result.to?.slice(0, 8)}... every ${result.interval}`
    } else if (result.status === 'proposing_hire') {
      title = '🤝 HIRE AGENT'
      detail = `${result.description} (budget: ${result.budget} USDC)`
    }

    return (
      <div className="tx-badge success" style={{ background: 'var(--cyan)', color: 'black', display: 'flex', flexDirection: 'column', gap: 8, padding: '12px', border: '1px solid black' }}>
        <div style={{ fontWeight: 600, fontSize: 12 }}>{title}</div>
        <div style={{ fontSize: 11, fontFamily: 'var(--font-mono)', background: 'rgba(0,0,0,0.1)', padding: '4px 8px', borderRadius: 4 }}>
          {detail}
        </div>
        <div style={{ display: 'flex', gap: 8, marginTop: 4 }}>
          <button 
            className="send-btn" 
            disabled={confirming}
            onClick={async () => {
              setConfirming(true)
              if (onConfirm) await onConfirm()
              setConfirming(false)
            }}
            style={{ flex: 2, background: 'black', color: 'var(--cyan)', border: 'none', padding: '8px', fontSize: 11, cursor: 'pointer', fontWeight: 600 }}
          >
            {confirming ? 'EXECUTING...' : 'CONFIRM & EXECUTE'}
          </button>
          <button 
            className="send-btn" 
            disabled={confirming}
            onClick={onCancel}
            style={{ flex: 1, background: 'rgba(0,0,0,0.1)', color: 'black', border: '1px solid black', padding: '8px', fontSize: 11, cursor: 'pointer' }}
          >
            CANCEL
          </button>
        </div>
      </div>
    )
  }

  if (result.status === 'executed' || result.status === 'success') {
    let feedback = `✓ Executed`
    if (result.type === 'schedule') {
       feedback = `✓ Scheduled: ${result.amount} ${result.token || 'USDC'} to ${result.to?.slice(0, 10)}...`
    } else if (result.type === 'pay' || result.to) {
       feedback = `✓ Sent ${result.amount} ${result.token || 'USDC'} to ${result.to?.slice(0, 10)}...`
    }

    return (
      <a 
        className="tx-badge success" 
        href={result.explorer} 
        target="_blank" 
        rel="noreferrer" 
        style={{ display: 'block', textDecoration: 'none', fontFamily: 'var(--font-mono)', fontSize: 10, padding: '8px 12px' }}
      >
        <div style={{ fontWeight: 'bold', marginBottom: 2 }}>{feedback}</div>
        <div style={{ opacity: 0.7 }}>Tx: {result.txHash?.slice(0, 16)}... ↗</div>
        <div style={{ marginTop: 4, fontSize: 8, color: 'rgba(0,0,0,0.5)', letterSpacing: 1 }}>CONFIRMED IN &lt; 1s</div>
      </a>
    )
  }

  if (result.status === 'cancelled') {
    return <div className="tx-badge" style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', color: 'var(--muted)', fontSize: 10, fontFamily: 'var(--font-mono)' }}>✗ Cancelled</div>
  }

  if (result.status === 'rejected') {
    return <div className="tx-badge rejected">🚫 Blocked: {result.reason}</div>
  }

  if (result.status === 'policy_updated') {
    return <div className="tx-badge success">🛡️ Policy Synchronized</div>
  }

  if (result.status === 'failed') {
    return <div className="tx-badge failed">⚠️ Error: {result.reason}</div>
  }

  return null
}

function BalanceCard({ data }: { data: any }) {
  if (!data?.balances) return null
  return (
    <div style={{
      marginTop: 10,
      border: '1px solid var(--border)',
      padding: '10px 14px',
      fontFamily: 'var(--font-mono)',
      fontSize: 12,
      color: 'var(--text)'
    }}>
      <div style={{ color: 'var(--teal)', marginBottom: 6, letterSpacing: 1 }}>// BALANCES</div>
      {Object.entries(data.balances).map(([token, amt]) => (
        <div key={token} style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 2 }}>
          <span style={{ color: 'var(--muted)' }}>{token}</span>
          <span>{String(amt)}</span>
        </div>
      ))}
      {data.vault && (
        <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 6, borderTop: '1px solid var(--border)', paddingTop: 6 }}>
          <span style={{ color: 'var(--muted)' }}>VAULT</span>
          <span style={{ color: 'var(--teal)' }}>{data.vault} USDC</span>
        </div>
      )}
    </div>
  )
}

function PolicyCard({ data }: { data: any }) {
  if (!data?.perTxCap) return null
  return (
    <div style={{
      marginTop: 10,
      border: '1px solid var(--border)',
      padding: '10px 14px',
      fontFamily: 'var(--font-mono)',
      fontSize: 12,
      color: 'var(--text)'
    }}>
      <div style={{ color: 'var(--teal)', marginBottom: 6, letterSpacing: 1 }}>// POLICY</div>
      {[
        ['PER_TX', `${data.perTxCap} USDC`],
        ['DAILY_CAP', `${data.dailyCap} USDC`],
        ['SPENT_TODAY', `${data.dailySpendSoFar} USDC`],
        ['REMAINING', `${data.dailyRemaining} USDC`],
        ['STATUS', data.active ? 'ACTIVE' : 'PAUSED'],
      ].map(([k, v]) => (
        <div key={k} style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 2 }}>
          <span style={{ color: 'var(--muted)' }}>{k}</span>
          <span style={{ color: k === 'STATUS' ? (data.active ? 'var(--teal)' : '#ff4444') : 'inherit' }}>{v}</span>
        </div>
      ))}
    </div>
  )
}

export default function Terminal({ messages, setMessages, userAddress, userId, onActionSuccess }: Props) {

  const [input, setInput] = React.useState('')
  const [loading, setLoading] = React.useState(false)
  const [txResults, setTxResults] = React.useState<Record<number, any>>({})
  const scrollRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)

  // Load chat history on mount
  useEffect(() => {
    if (!userAddress) return
    getChatHistory(userId)
      .then(res => {
        if (res.history?.length > 0) {
          const filtered = res.history.filter((m: any) => {
            if (m.role !== 'assistant') return true
            return !m.content?.startsWith("Your current balances") && !m.content?.startsWith("Your current Vault") && !m.content?.startsWith("Your spending policy")
          })
          setMessages(filtered.map((m: any) => ({ ...m, timestamp: m.timestamp || Date.now() })))
        }
      })
      .catch(() => {})
  }, [userAddress, setMessages])

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight
    }
  }, [messages, loading])

  function parseInterval(str: string) {
    if (!str) return 86400;
    const s = str.toLowerCase();
    if (s.includes('minute')) return (parseInt(s) || 1) * 60;
    if (s.includes('hour')) return (parseInt(s) || 1) * 3600;
    if (s.includes('day')) return (parseInt(s) || 1) * 86400;
    if (s.includes('week')) return (parseInt(s) || 1) * 604800;
    return 86400;
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
      } else if (prop.status === 'proposing_schedule') {
        const intervalSec = parseInterval(prop.interval)
        const schedRes = await createOnChainSchedule(
          prop.to, prop.amount, intervalSec, prop.reason || '', userId,
          prop.conditions?.minBalance || 0
        )
        res = { status: 'executed', txHash: schedRes.txHash, explorer: schedRes.explorer, type: 'schedule', to: prop.to, amount: prop.amount }
      } else if (prop.status === 'proposing_hire') {
        const hireRes = await hireAgent(prop.description, prop.budget, userId)
        res = { status: hireRes.success ? 'executed' : 'rejected', txHash: hireRes.fundTxHash || hireRes.createTxHash, explorer: 'https://testnet.arcscan.arc.network/tx/' + (hireRes.fundTxHash || hireRes.createTxHash || ''), type: 'hire', to: prop.to, amount: prop.budget, reason: hireRes.reason || '' }
      }

      if (res) {
        setTxResults(r => ({ ...r, [msgIdx]: res }))
        if ((res.status === 'executed' || res.status === 'success') && onActionSuccess) {
          setTimeout(() => onActionSuccess(), 3000)
        }
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

    // Clear command
    if (text.toLowerCase() === 'clear') {
      await clearChatHistory(userId).catch(() => {})
      setMessages([{ role: 'assistant', content: 'Memory cleared.', timestamp: Date.now() }])
      setInput('')
      return
    }

    // Status shortcut
    if (text.toLowerCase() === 'status') {
      const userMsg: ChatMessage = { role: 'user', content: text, timestamp: Date.now() }
      setMessages(prev => [...prev, userMsg])
      setInput('')
      getVaultBalanceApi(userId)
        .then(res => {
          setMessages(prev => [...prev, {
            role: 'assistant',
            content: `Vault balance: ${res.balance} USDC\nWorker: online\nPolicy: active`,
            timestamp: Date.now()
          }])
        })
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

      const assistantMsg: ChatMessage = {
        role: 'assistant',
        content: intent.message || 'Processing complete.',
        timestamp: Date.now(),
        intent: res.intent,
        data: res.data
      }

      setMessages(prev => {
        const next = [...prev, assistantMsg]
        const msgIndex = next.length - 1

        // Handle actions after state is updated
        setTimeout(async () => {
          if (intent.action === 'pay' && intent.to && intent.amount) {
            setTxResults(r => ({ 
              ...r, 
              [msgIndex]: { 
                status: 'proposing_pay', 
                to: intent.to, 
                amount: intent.amount, 
                    token: 'USDC',
                reason: intent.reason
              } 
            }))
          }

          if (intent.action === 'schedule' && intent.to && intent.amount && intent.interval) {
             setTxResults(r => ({ 
               ...r, 
               [msgIndex]: { 
                 status: 'proposing_schedule', 
                 to: intent.to, 
                 amount: intent.amount, 
                 interval: intent.interval,
                 reason: intent.reason,
                 conditions: intent.conditions
               } 
             }))
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
              if (up.field === 'addWhitelist' && up.address) {
                update.whitelist = [...new Set([...(current.whitelist || []), up.address])]
              }
              if (up.field === 'removeWhitelist' && up.address) {
                update.whitelist = (current.whitelist || []).filter((a: string) => a.toLowerCase() !== up.address?.toLowerCase())
              }
              return await updatePolicy(update, userId)
            }
            applyPolicyUpdate()
              .then(() => {
                setTxResults(r => ({ ...r, [msgIndex]: { status: 'policy_updated' } }))
                if (onActionSuccess) onActionSuccess()
              })
              .catch(err => setTxResults(r => ({ ...r, [msgIndex]: { status: 'failed', reason: err.message } })))
          }

          if (intent.action === 'hire_agent' && intent.description) {
            setTxResults(r => ({
              ...r,
              [msgIndex]: {
                status: 'proposing_hire',
                description: intent.description,
                budget: intent.budget || 0,
                to: intent.to,
              }
            }))
          }

          if (intent.action === 'fetch_and_pay') {
            // Backend auto-executes paid fetches; show the outcome as a badge.
            const chatRes: any = res
            if (chatRes.result) {
              setTxResults(prev => ({
                ...prev,
                [msgIndex]: chatRes.result.success
                  ? { status: 'executed', type: 'fetch', to: chatRes.result.actualPayTo || intent.url, amount: chatRes.result.actualAmount || intent.maxAmount, txHash: 'x402' }
                  : { status: 'rejected', reason: chatRes.result.reason || 'fetch failed' }
              }))
            }
          }
        }, 0)

        return next
      })
    } catch (err: any) {
      setMessages(prev => [...prev, {
        role: 'assistant',
        content: 'Connection error: ' + err.message,
        timestamp: Date.now()
      }])
    } finally {
      setLoading(false)
      inputRef.current?.focus()
    }
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSend()
    }
  }

  if (!userAddress) return (
    <div className="terminal">
      <div className="messages">
        <div className="message assistant">
          <div className="message-bubble">
            👋 Connect your wallet to get started — tap the menu (☰) in the top right.
          </div>
        </div>
      </div>
    </div>
  )

  return (
    <div className="terminal">
      <div className="messages" ref={scrollRef}>
        {messages.map((msg, i) => (
          <div key={i} className={`message ${msg.role}`}>
            <div className="message-bubble">
              {msg.content}
              {msg.role === 'assistant' && msg.intent?.requestId && (
                <ProofBadge requestId={msg.intent.requestId} />
              )}
              {msg.role === 'assistant' && (msg as any).data && (msg as any).intent?.action === 'balance' && (
                <BalanceCard data={(msg as any).data} />
              )}
              {msg.role === 'assistant' && (msg as any).data && (msg as any).intent?.action === 'policy' && (
                <PolicyCard data={(msg as any).data} />
              )}
              {msg.role === 'assistant' && txResults[i] && (
                <div style={{ marginTop: 10 }}>
                  <TxBadge 
                    result={txResults[i]} 
                    onConfirm={() => handleConfirm(i)} 
                    onCancel={() => handleCancel(i)}
                  />
                </div>
              )}
            </div>
            <div style={{
              fontSize: 10,
              color: 'var(--muted)',
              marginTop: 4,
              textAlign: msg.role === 'user' ? 'right' : 'left',
              fontFamily: 'var(--font-mono)'
            }}>
              {formatTime(msg.timestamp)}
            </div>
          </div>
        ))}

        {loading && (
          <div className="message assistant">
            <div className="typing">
              <span /><span /><span />
            </div>
          </div>
        )}
      </div>

      <div className="quick-actions">
        {['SEND', 'BALANCE', 'POLICY'].map(btn => (
            <button
              key={btn}
              className="quick-btn"
              onClick={() => {
                const prompts: Record<string, string> = {
                  SEND: 'Send 0.5 USDC to 0x...',
                  BALANCE: 'What is my vault balance?',
                  POLICY: 'Show my current policy'
                }
              const val = prompts[btn]
              const autoSend = btn === 'BALANCE' || btn === 'POLICY'
              if (autoSend) {
                handleSend(val)
              } else {
                setInput(val)
                inputRef.current?.focus()
              }
            }}
            disabled={loading}
          >
            {btn}
          </button>
        ))}
      </div>

      <div className="input-area">
        <textarea
          ref={inputRef}
          className="chat-input"
          placeholder="Type a message..."
          value={input}
          onChange={(e) => {
            setInput(e.target.value)
            e.target.style.height = 'auto'
            e.target.style.height = e.target.scrollHeight + 'px'
          }}
          onKeyDown={handleKeyDown}
          rows={1}
          disabled={loading}
          style={{ maxHeight: '120px' }}
        />
        <button className="send-btn icon-btn" onClick={() => handleSend()} disabled={loading || !input.trim()}>
          ➤
        </button>
      </div>
    </div>
  )
}

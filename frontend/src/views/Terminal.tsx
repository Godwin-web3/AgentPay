import React, { useRef, useEffect } from 'react'
import { sendChat, executePay, generateRequestId, getPolicy } from '../api'
import type { ChatMessage } from '../types'

interface Props {
  messages: ChatMessage[]
  setMessages: React.Dispatch<React.SetStateAction<ChatMessage[]>>
  userAddress: string
}

function formatTime(ts: number) {
  return new Date(ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
}

function TxBadge({ result }: { result?: any }) {
  if (!result) return null
  if (result.status === 'executed') {
    return (
      <a className="tx-badge success" href={result.explorer} target="_blank" rel="noreferrer">
        ✅ View Transaction: {result.txHash?.slice(0, 8)}...
      </a>
    )
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
          <span style={{ color: 'var(--teal)' }}>{data.vault} STT</span>
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
        ['PER_TX', `${data.perTxCap} STT`],
        ['DAILY_CAP', `${data.dailyCap} STT`],
        ['SPENT_TODAY', `${data.dailySpendSoFar} STT`],
        ['REMAINING', `${data.dailyRemaining} STT`],
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

export default function Terminal({ messages, setMessages, userAddress }: Props) {
  const [input, setInput] = React.useState('')
  const [loading, setLoading] = React.useState(false)
  const [txResults, setTxResults] = React.useState<Record<number, any>>({})
  const scrollRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)

  // Load chat history on mount
  useEffect(() => {
    if (!userAddress) return
    fetch('https://agentpay-worker.mbagodwin419.workers.dev/chat', {
      headers: { 'x-user-address': userAddress }
    })
      .then(r => r.json())
      .then(res => {
        if (res.history?.length > 0) setMessages(res.history)
      })
      .catch(() => {})
  }, [userAddress, setMessages])

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight
    }
  }, [messages, loading])

  async function handleSend() {
    const text = input.trim()
    if (!text || loading) return

    // Clear command
    if (text.toLowerCase() === 'clear') {
      await fetch('https://agentpay-worker.mbagodwin419.workers.dev/chat', {
        method: 'DELETE',
        headers: { 'x-user-address': userAddress }
      }).catch(() => {})
      setMessages([{ role: 'assistant', content: 'Memory cleared.', timestamp: Date.now() }])
      setInput('')
      return
    }

    // Status shortcut
    if (text.toLowerCase() === 'status') {
      const userMsg: ChatMessage = { role: 'user', content: text, timestamp: Date.now() }
      setMessages(prev => [...prev, userMsg])
      setInput('')
      const RPC = 'https://dream-rpc.somnia.network'
      const VAULT = '0x7E5235C0c711Cf2CA57a18d7BFD79a8cd453793D'
      fetch(RPC, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          jsonrpc: '2.0', id: 1, method: 'eth_call',
          params: [{ to: VAULT, data: '0xf8b2cb4f000000000000000000000000' + userAddress.replace('0x', '').toLowerCase() }, 'latest']
        })
      })
        .then(r => r.json())
        .then(data => {
          const bal = (Number(BigInt(data.result === '0x' ? '0x0' : data.result)) / 1e18).toFixed(4)
          setMessages(prev => [...prev, {
            role: 'assistant',
            content: `Vault balance: ${bal} STT\nWorker: online\nPolicy: active`,
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
      const res = await sendChat(text, userAddress)
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

        if (intent.action === 'pay' && intent.to && intent.amount) {
          const requestId = generateRequestId()
          executePay(intent.to, intent.amount, intent.reason || 'Chat payment', requestId, userAddress)
            .then(payRes => setTxResults(r => ({ ...r, [msgIndex]: payRes })))
            .catch(err => setTxResults(r => ({ ...r, [msgIndex]: { status: 'failed', reason: err.message } })))
        }

        if (intent.action === 'update_policy' && intent.policyUpdate) {
          const up = intent.policyUpdate
          const applyPolicyUpdate = async () => {
            const current = await getPolicy(userAddress)
            const update: any = {}
            if (up.field === 'dailyCap') update.dailyCap = up.value
            if (up.field === 'perTxCap') update.perTxCap = up.value
            if (up.field === 'maxTxPerHour') update.circuitBreaker = { ...current.circuitBreaker, maxTxPerHour: up.value }
            if (up.field === 'activeHours') update.activeHours = { start: up.start, end: up.end }
            if (up.field === 'addWhitelist' && up.address) {
              update.whitelist = [...new Set([...current.whitelist, up.address])]
            }
            if (up.field === 'removeWhitelist' && up.address) {
              update.whitelist = current.whitelist.filter(a => a.toLowerCase() !== up.address?.toLowerCase())
            }
            return await updatePolicy(update, userAddress)
          }
          applyPolicyUpdate()
            .then(() => setTxResults(r => ({ ...r, [msgIndex]: { status: 'policy_updated' } })))
            .catch(err => setTxResults(r => ({ ...r, [msgIndex]: { status: 'failed', reason: err.message } })))
        }

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

  return (
    <div className="terminal">
      <div className="messages" ref={scrollRef}>
        {messages.map((msg, i) => (
          <div key={i} className={`message ${msg.role}`}>
            <div className="message-bubble">
              {msg.content}
              {msg.role === 'assistant' && (msg as any).data && (msg as any).intent?.action === 'balance' && (
                <BalanceCard data={(msg as any).data} />
              )}
              {msg.role === 'assistant' && (msg as any).data && (msg as any).intent?.action === 'policy' && (
                <PolicyCard data={(msg as any).data} />
              )}
              {msg.role === 'assistant' && txResults[i] && (
                <div style={{ marginTop: 10 }}>
                  <TxBadge result={txResults[i]} />
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
        {['SEND', 'SWAP', 'BALANCE', 'POLICY'].map(btn => (
          <button
            key={btn}
            className="quick-btn"
            onClick={() => {
              const prompts: Record<string, string> = {
                SEND: 'Send 0.5 STT to 0x...',
                SWAP: 'Swap 10 SUSD to WSTT',
                BALANCE: 'What is my vault balance?',
                POLICY: 'Show my current policy'
              }
              const val = prompts[btn]
              const autoSend = btn === 'BALANCE' || btn === 'POLICY'
              setInput(val)
              if (autoSend) {
                setTimeout(() => handleSend(), 0)
              } else {
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
        <button className="send-btn icon-btn" onClick={handleSend} disabled={loading || !input.trim()}>
          ➤
        </button>
      </div>
    </div>
  )
}

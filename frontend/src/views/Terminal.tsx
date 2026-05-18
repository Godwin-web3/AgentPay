import React, { useRef, useEffect } from 'react'
import { sendChat, executePay, generateRequestId, getPolicy, getChatHistory, WORKER_URL, VAULT_ADDRESS, RPC } from '../api'
import type { ChatMessage } from '../types'
import { ethers } from 'ethers'

interface Props {
  messages: ChatMessage[]
  setMessages: React.Dispatch<React.SetStateAction<ChatMessage[]>>
  userAddress: string
}

function formatTime(ts: number) {
  return new Date(ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
}

function TxBadge({ result, onConfirm }: { result?: any, onConfirm?: () => void }) {
  const [confirming, setConfirming] = React.useState(false)
  if (!result) return null
  
  if (result.status === 'proposing_swap' || result.status === 'proposing_intent') {
    return (
      <div className="tx-badge success" style={{ background: 'var(--cyan)', color: 'black', display: 'flex', flexDirection: 'column', gap: 8, padding: '12px' }}>
        <div style={{ fontWeight: 600 }}>
          {result.status === 'proposing_swap' ? '🔄 Swap Proposal' : '⚡ Atomic Intent'}
        </div>
        <div style={{ fontSize: 11 }}>
          {result.status === 'proposing_swap' 
            ? `${result.amount} ${result.fromToken} → ${result.toToken}` 
            : `${result.intentName?.replace(/_/g, ' ').toUpperCase()}`}
        </div>
        <button 
          className="send-btn" 
          disabled={confirming}
          onClick={async () => {
            setConfirming(true)
            if (onConfirm) await onConfirm()
            setConfirming(false)
          }}
          style={{ background: 'black', color: 'var(--cyan)', border: 'none', padding: '6px', fontSize: 10, cursor: 'pointer' }}
        >
          {confirming ? 'EXECUTING...' : 'CONFIRM & EXECUTE'}
        </button>
      </div>
    )
  }
  if (result.status === 'executed' || result.status === 'success') {
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
    getChatHistory(userAddress)
      .then(res => {
        if (res.history?.length > 0) {
          const filtered = res.history.filter((m: any) => {
            if (m.role !== 'assistant') return true
            return !m.content?.startsWith("Your current balances") && !m.content?.startsWith("Your current Vault") && !m.content?.startsWith("Your spending policy")
          })
          setMessages(filtered)
        }
      })
      .catch(() => {})
  }, [userAddress, setMessages])

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight
    }
  }, [messages, loading])

  async function handleConfirm(msgIdx: number) {
    const prop = txResults[msgIdx]
    if (!prop) return

    if (prop.status === 'proposing_swap') {
      try {
        const res = await fetch(`${WORKER_URL}/swap`, {
          method: "POST",
          headers: { "Content-Type": "application/json", "x-user-address": userAddress },
          body: JSON.stringify({ fromToken: prop.fromToken, toToken: prop.toToken, amount: prop.amount, execute: true })
        }).then(r => r.json())
        setTxResults(r => ({ ...r, [msgIdx]: res }))
      } catch (err: any) {
        setTxResults(r => ({ ...r, [msgIdx]: { status: 'failed', reason: err.message } }))
      }
    }

    if (prop.status === 'proposing_intent') {
      try {
        const res = await fetch(`${WORKER_URL}/intent`, {
          method: "POST",
          headers: { "Content-Type": "application/json", "x-user-address": userAddress },
          body: JSON.stringify({ intentName: prop.intentName, amount: prop.amount, to: prop.to, reason: prop.reason })
        }).then(r => r.json())
        setTxResults(r => ({ ...r, [msgIdx]: res }))
      } catch (err: any) {
        setTxResults(r => ({ ...r, [msgIdx]: { status: 'failed', reason: err.message } }))
      }
    }
  }

  async function handleSend(overrideText?: string) {
    const text = (overrideText || input).trim()
    if (!text || loading) return

    // Clear command
    if (text.toLowerCase() === 'clear') {
      await fetch(`${WORKER_URL}/chat`, {
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
      fetch(RPC, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          jsonrpc: '2.0', id: 1, method: 'eth_call',
          params: [{ to: VAULT_ADDRESS, data: '0xf8b2cb4f' + userAddress.replace('0x', '').toLowerCase().padStart(64, '0') + '0000000000000000000000000000000000000000000000000000000000000000' }, 'latest']
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

        // Handle actions after state is updated
        setTimeout(async () => {
          if (intent.action === 'pay' && intent.to && intent.amount) {
            const requestId = generateRequestId()
            executePay(intent.to, intent.amount, intent.reason || 'Chat payment', requestId, userAddress)
              .then(payRes => setTxResults(r => ({ ...r, [msgIndex]: payRes })))
              .catch(err => setTxResults(r => ({ ...r, [msgIndex]: { status: 'failed', reason: err.message } })))
          }

          if (intent.action === 'schedule' && intent.to && intent.amount && intent.interval) {
            fetch(`${WORKER_URL}/schedules`, {
              method: "POST",
              headers: { "Content-Type": "application/json", "x-user-address": userAddress },
              body: JSON.stringify({ to: intent.to, amount: intent.amount, interval: intent.interval, reason: intent.reason, conditions: intent.conditions })
            })
              .then(r => r.json())
              .then(async res => {
                if (res.action === 'contract_call') {
                  const iface = new ethers.Interface(["function createSchedule(address to, uint256 amount, uint256 interval, string calldata reason, uint256 minBalance) external"])
                  const data = iface.encodeFunctionData("createSchedule", res.args)
                  const txHash = await window.ethereum.request({
                    method: 'eth_sendTransaction',
                    params: [{ from: userAddress, to: VAULT_ADDRESS, data }]
                  })
                  setTxResults(r => ({ ...r, [msgIndex]: { status: 'executed', txHash, explorer: 'https://shannon-explorer.somnia.network/tx/' + txHash } }))
                }
              })
              .catch(err => setTxResults(r => ({ ...r, [msgIndex]: { status: 'failed', reason: err.message } })))
          }

          if (intent.action === 'propose_swap' && intent.fromToken && intent.toToken && intent.amount) {
             setTxResults(r => ({ 
               ...r, 
               [msgIndex]: { 
                 status: 'proposing_swap', 
                 fromToken: intent.fromToken, 
                 toToken: intent.toToken, 
                 amount: intent.amount 
               } 
             }))
          }

          if (intent.action === 'execute_swap') {
            // Use functional update to avoid stale txResults
            setTxResults(currentResults => {
              const lastPropIdx = [...next.keys()].reverse().find(idx => currentResults[idx]?.status === 'proposing_swap' || currentResults[idx]?.status === 'proposing_intent')
              if (lastPropIdx !== undefined) {
                 handleConfirm(lastPropIdx)
              }
              return currentResults
            })
          }

          if (intent.action === 'intent' && intent.intentName) {
             setTxResults(r => ({ 
               ...r, 
               [msgIndex]: { 
                 status: 'proposing_intent', 
                 intentName: intent.intentName,
                 amount: intent.amount, 
                 to: intent.to, 
                 reason: intent.reason || 'Atomic Intent'
               } 
             }))
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
              return await fetch(`${WORKER_URL}/policy`, { method: "POST", headers: { "Content-Type": "application/json", "x-user-address": userAddress }, body: JSON.stringify(update) }).then(r => r.json())
            }
            applyPolicyUpdate()
              .then(() => setTxResults(r => ({ ...r, [msgIndex]: { status: 'policy_updated' } })))
              .catch(err => setTxResults(r => ({ ...r, [msgIndex]: { status: 'failed', reason: err.message } })))
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
                  <TxBadge result={txResults[i]} onConfirm={() => handleConfirm(i)} />
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

import React, { useRef, useEffect } from 'react'
import { sendChat, executePay, generateRequestId, getPolicy, updatePolicy } from '../api'
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
        ✅ {result.txHash?.slice(0, 10)}... — View on Explorer
      </a>
    )
  }
  if (result.status === 'rejected') {
    return <div className="tx-badge rejected">🚫 Blocked — {result.reason}</div>
  }
  if (result.status === 'policy_updated') {
    return <div className="tx-badge success">2705 Policy updated successfully</div>
  }
  if (result.status === 'failed') {
    return <div className="tx-badge failed">⚠️ Failed — {result.reason}</div>
  }
  return null
}

export default function Terminal({ messages, setMessages, userAddress }: Props) {
  const [input, setInput] = React.useState('')
  const [loading, setLoading] = React.useState(false)
  const [txResults, setTxResults] = React.useState<Record<number, any>>({})
  const bottomRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, loading])

  async function handleSend() {
    const text = input.trim()
    if (!text || loading) return

    const history = messages.map(m => ({ role: m.role, content: m.content }))
    const userMsg: ChatMessage = { role: 'user', content: text, timestamp: Date.now() }
    setMessages(prev => [...prev, userMsg])
    setInput('')
    setLoading(true)

    try {
      const res = await sendChat(text, history, userAddress)
      const intent = res.intent

      const assistantMsg: ChatMessage = {
        role: 'assistant',
        content: intent.message || 'Done.',
        timestamp: Date.now()
      }

      setMessages(prev => {
        const next = [...prev, assistantMsg]
        if (intent.action === 'pay' && intent.to && intent.amount) {
          const msgIndex = next.length - 1
          const requestId = generateRequestId()
          executePay(intent.to, intent.amount, intent.reason || 'Chat payment', requestId, userAddress)
            .then(payRes => setTxResults(r => ({ ...r, [msgIndex]: payRes })))
            .catch(err => setTxResults(r => ({ ...r, [msgIndex]: { status: 'failed', reason: err.message } })))
        }

        if (intent.action === 'update_policy' && intent.policyUpdate) {
          const up = intent.policyUpdate
          const msgIndex = next.length - 1
          
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
            .then(() => {
              setTxResults(r => ({ ...r, [msgIndex]: { status: 'policy_updated' } }))
              setMessages(current => {
                const updated = [...current]
                updated.push({
                  role: 'assistant',
                  content: '✅ Policy update applied successfully.',
                  timestamp: Date.now()
                })
                return updated
              })
            })
            .catch(err => {
              setTxResults(r => ({ ...r, [msgIndex]: { status: 'failed', reason: err.message } }))
            })
        }
        return next
      })
    } catch (err: any) {
      setMessages(prev => [...prev, {
        role: 'assistant',
        content: 'Connection error — ' + err.message,
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

  function handleInput(e: React.ChangeEvent<HTMLTextAreaElement>) {
    setInput(e.target.value)
    e.target.style.height = 'auto'
    e.target.style.height = e.target.scrollHeight + 'px'
  }

  return (
    <div className="terminal">
      <div className="messages">
        {messages.map((msg, i) => (
          <div key={i} className={`message ${msg.role}`}>
            <div className="message-bubble">
              {msg.content}
              {msg.role === 'assistant' && txResults[i] && (
                <TxBadge result={txResults[i]} />
              )}
            </div>
            <div className="message-meta">{formatTime(msg.timestamp)}</div>
          </div>
        ))}

        {loading && (
          <div className="message assistant">
            <div className="typing">
              <span /><span /><span />
            </div>
          </div>
        )}

        <div ref={bottomRef} />
      </div>

      <div className="input-area">
        <textarea
          ref={inputRef}
          className="chat-input"
          placeholder="Send 0.5 STT to 0x... or ask anything"
          value={input}
          onChange={handleInput}
          onKeyDown={handleKeyDown}
          rows={1}
          disabled={loading}
        />
        <button className="send-btn" onClick={handleSend} disabled={loading}>
          ➤
        </button>
      </div>
    </div>
  )
}

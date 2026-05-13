import { useState, useRef, useEffect } from 'react'
import { sendChat, executePay, generateRequestId } from '../api'
import type { ChatMessage } from '../types'

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
  if (result.status === 'failed') {
    return <div className="tx-badge failed">⚠️ Failed — {result.reason}</div>
  }
  return null
}

export default function Terminal() {
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      role: 'assistant',
      content: 'AgentPay online. I can send payments, manage schedules, and enforce your policy. What do you need?',
      timestamp: Date.now()
    }
  ])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const [txResults, setTxResults] = useState<Record<number, any>>({})
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
      const res = await sendChat(text, history)
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
          executePay(intent.to, intent.amount, intent.reason || 'Chat payment', requestId)
            .then(payRes => setTxResults(r => ({ ...r, [msgIndex]: payRes })))
            .catch(err => setTxResults(r => ({ ...r, [msgIndex]: { status: 'failed', reason: err.message } })))
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

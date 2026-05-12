import { useState, useRef, useEffect } from 'react'
import { api } from '../services/api'

interface Message {
  role: 'user' | 'agent'
  content: string
  time: string
  intent?: Record<string, unknown> | null
}

const INIT: Message = {
  role: 'agent',
  content: 'Greetings. I am your AgentPay interface. How can I assist with your STT assets today?',
  time: new Date().toTimeString().slice(0, 8),
  intent: null,
}

export default function Terminal({ apiKey: initialApiKey }: { apiKey: string }) {
  const [messages, setMessages] = useState<Message[]>([INIT])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const [apiKey, setApiKey] = useState(initialApiKey || localStorage.getItem('ap_key') || '')
  const [showKeyInput, setShowKeyInput] = useState(!apiKey)
  const bottomRef = useRef<HTMLDivElement>(null)
  const historyRef = useRef<{ role: string; content: string }[]>([])

  useEffect(() => {
    if (initialApiKey) {
      setApiKey(initialApiKey)
      setShowKeyInput(false)
    }
  }, [initialApiKey])

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, loading])

  const saveKey = (key: string) => {
    localStorage.setItem('ap_key', key)
    setApiKey(key)
    setShowKeyInput(false)
  }

  const send = async () => {
    if (!input.trim() || loading) return
    const userMsg: Message = { role: 'user', content: input, time: new Date().toTimeString().slice(0, 8) }
    setMessages(prev => [...prev, userMsg])
    historyRef.current = [...historyRef.current, { role: 'user', content: input }]
    setInput('')
    setLoading(true)

    try {
      const data = await api.chat(apiKey, input, historyRef.current.slice(-10))
      const intent = data.intent || {}
      const agentMsg: Message = {
        role: 'agent',
        content: intent.message || 'Command processed.',
        time: new Date().toTimeString().slice(0, 8),
        intent: intent.action !== 'unknown' ? intent : null,
      }
      historyRef.current = [...historyRef.current, { role: 'assistant', content: agentMsg.content }]
      setMessages(prev => [...prev, agentMsg])
    } catch {
      setMessages(prev => [...prev, {
        role: 'agent',
        content: 'Error. Please check your API key and try again.',
        time: new Date().toTimeString().slice(0, 8),
        intent: null,
      }])
    } finally {
      setLoading(false)
    }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', background: '#0A0A0A' }}>
      {showKeyInput && (
        <div style={{ padding: '10px 16px', background: '#141414', borderBottom: '1px solid #262626', display: 'flex', gap: 8, alignItems: 'center' }}>
          <span className="material-symbols-outlined" style={{ fontSize: 16, color: '#bbcac6' }}>key</span>
          <input
            style={{ flex: 1, background: '#0A0A0A', border: '1px solid #262626', color: '#e5e2e1', fontFamily: 'JetBrains Mono', fontSize: 13, padding: '6px 10px', outline: 'none' }}
            placeholder="Enter API key (ak_...)"
            onKeyDown={e => e.key === 'Enter' && saveKey(e.currentTarget.value)}
          />
          <button
            onClick={e => saveKey((e.currentTarget.previousElementSibling as HTMLInputElement).value)}
            style={{ padding: '6px 12px', background: '#14b8a6', color: '#003731', border: 'none', fontFamily: 'JetBrains Mono', fontSize: 11, fontWeight: 700, cursor: 'pointer' }}>
            SAVE
          </button>
          <button onClick={() => setShowKeyInput(false)}
            style={{ background: 'none', border: 'none', color: '#bbcac6', cursor: 'pointer', padding: 4 }}>
            <span className="material-symbols-outlined" style={{ fontSize: 16 }}>close</span>
          </button>
        </div>
      )}

      {/* Messages */}
      <div style={{ flex: 1, overflowY: 'auto', padding: 24, display: 'flex', flexDirection: 'column', gap: 20 }}>
        {messages.map((msg, i) => (
          <div key={i} style={{ display: 'flex', flexDirection: 'column', alignItems: msg.role === 'user' ? 'flex-end' : 'flex-start', gap: 4 }}>
            {msg.role === 'agent' ? (
              <div style={{ background: '#141414', border: '1px solid #262626', borderRadius: '2px 12px 12px 12px', padding: '14px 18px', maxWidth: '75%', fontFamily: 'Geist', fontSize: 14, color: '#e5e2e1', lineHeight: 1.7 }}>
                {msg.content}
              </div>
            ) : (
              <div style={{ background: '#14b8a6', borderRadius: '12px 2px 12px 12px', padding: '14px 18px', maxWidth: '70%', fontFamily: 'Geist', fontSize: 14, color: '#003731', lineHeight: 1.7 }}>
                {msg.content}
              </div>
            )}

            {msg.intent && msg.intent.action && msg.intent.action !== 'unknown' && (
              <div style={{ padding: 14, background: '#0A0A0A', border: '1px solid rgba(79,219,200,0.25)', maxWidth: '75%', marginTop: 4 }}>
                <div style={{ fontFamily: 'JetBrains Mono', fontSize: 10, fontWeight: 700, color: '#4fdbc8', letterSpacing: '0.08em', marginBottom: 10, display: 'flex', alignItems: 'center', gap: 6 }}>
                  <span className="material-symbols-outlined" style={{ fontSize: 13 }}>memory</span>
                  ENGINE PARSED INTENT
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: 'auto 1fr', gap: '6px 20px', fontFamily: 'JetBrains Mono', fontSize: 12 }}>
                  <span style={{ color: '#bbcac6' }}>ACTION</span>
                  <span style={{ color: '#4fdbc8', fontWeight: 700, textTransform: 'uppercase' }}>{String(msg.intent.action)}</span>
                  {msg.intent.to && <>
                    <span style={{ color: '#bbcac6' }}>TARGET</span>
                    <span style={{ color: '#e5e2e1' }}>{String(msg.intent.to).slice(0, 20)}...</span>
                  </>}
                  {msg.intent.amount && <>
                    <span style={{ color: '#bbcac6' }}>AMOUNT</span>
                    <span style={{ color: '#e5e2e1' }}>{String(msg.intent.amount)} STT</span>
                  </>}
                  <span style={{ color: '#bbcac6' }}>STATUS</span>
                  <span style={{ color: '#4fdbc8', display: 'flex', alignItems: 'center', gap: 6 }}>
                    <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#4fdbc8', display: 'inline-block' }} />
                    READY
                  </span>
                </div>
              </div>
            )}

            <span style={{ fontFamily: 'JetBrains Mono', fontSize: 10, color: '#444', marginTop: 2 }}>
              {msg.role === 'user' ? 'YOU' : 'AGENT'} • {msg.time}
            </span>
          </div>
        ))}

        {loading && (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start' }}>
            <div style={{ background: '#141414', border: '1px solid #262626', borderRadius: '2px 12px 12px 12px', padding: '14px 18px' }}>
              <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                {[0, 150, 300].map(delay => (
                  <span key={delay} style={{ width: 7, height: 7, borderRadius: '50%', background: '#4fdbc8', display: 'inline-block', opacity: 0.6 }} />
                ))}
              </div>
            </div>
          </div>
        )}
        <div ref={bottomRef} />
      </div>

      {/* Input */}
      <div style={{ padding: '16px 24px', background: '#0A0A0A', borderTop: '1px solid #262626', flexShrink: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', background: '#141414', border: '1px solid #262626', padding: '4px 4px 4px 14px', gap: 8 }}>
          <span className="material-symbols-outlined" style={{ fontSize: 16, color: '#444' }}>terminal</span>
          <input
            style={{ flex: 1, background: 'transparent', border: 'none', outline: 'none', fontFamily: 'JetBrains Mono', fontSize: 13, color: '#e5e2e1', padding: '10px 0' }}
            placeholder="e.g. 'Pay 0.5 STT to 0xABC for quest reward'..."
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && send()}
          />
          <button
            onClick={() => setShowKeyInput(v => !v)}
            style={{ background: 'none', border: 'none', color: '#444', cursor: 'pointer', padding: '4px 8px' }}
            title="API Key">
            <span className="material-symbols-outlined" style={{ fontSize: 16 }}>key</span>
          </button>
          <button
            onClick={send}
            style={{ padding: '10px 20px', background: '#4fdbc8', color: '#003731', border: 'none', fontFamily: 'JetBrains Mono', fontSize: 11, fontWeight: 700, letterSpacing: '0.08em', cursor: 'pointer' }}>
            ENTER
          </button>
        </div>
      </div>
    </div>
  )
}

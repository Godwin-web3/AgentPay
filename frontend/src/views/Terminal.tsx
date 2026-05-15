import React, { useRef, useEffect, useState } from 'react'
import { sendChat, executePay, generateRequestId, executeSwap, getChatHistory, clearChatHistory } from '../api'
import type { ChatMessage } from '../types'
import { ethers } from 'ethers'

const VAULT_ADDRESS = '0x7E5235C0c711Cf2CA57a18d7BFD79a8cd453793D'
const VAULT_ABI = [
  "function createSchedule(address to, uint256 amount, uint256 interval, string calldata reason) external"
]

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
  if (result.status === 'executed' || result.status === 'success') {
    return (
      <a className="tx-badge success" href={result.explorer} target="_blank" rel="noreferrer">
        [OK] {result.message || 'View Transaction'} ↗
      </a>
    )
  }
  if (result.status === 'rejected') {
    return <div className="tx-badge rejected">[BLOCKED] {result.reason}</div>
  }
  if (result.status === 'failed') {
    return <div className="tx-badge failed">[ERROR] {result.reason}</div>
  }
  return null
}

export default function Terminal({ messages, setMessages, userAddress }: Props) {
  const [input, setInput] = React.useState('')
  const [loading, setLoading] = React.useState(false)
  const [txResults, setTxResults] = React.useState<Record<number, any>>({})
  const [pendingSwap, setPendingSwap] = useState<any>(null)
  const scrollRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)

  useEffect(() => {
    if (userAddress) {
      setLoading(true)
      getChatHistory(userAddress)
        .then(res => {
          if (res.history && res.history.length > 0) {
            setMessages(res.history)
          }
        })
        .finally(() => setLoading(false))
    }
  }, [userAddress])

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight
    }
  }, [messages, loading])

  async function handleSend(overrideText?: string) {
    const text = overrideText || input.trim()
    if (!text || loading) return

    if (text.toLowerCase() === "clear") {
      setLoading(true)
      await clearChatHistory(userAddress)
      setMessages([{ role: 'assistant', content: 'Memory cleared. How can I help you today?', timestamp: Date.now() }])
      setLoading(false)
      setInput('')
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
        content: res.message || 'Agent is thinking...',
        timestamp: Date.now(),
        intent: intent
      }

      setMessages(prev => {
        const next = [...prev, assistantMsg]
        const msgIndex = next.length - 1

        if (intent.action === 'propose_swap') {
          executeSwap(intent.fromToken!, intent.toToken!, intent.amount!, false, userAddress)
            .then(swapRes => {
              setTxResults(r => ({ ...r, [msgIndex]: { status: 'proposed', ...swapRes } }))
              setPendingSwap({ ...intent, msgIndex })
            })
            .catch((err: any) => setTxResults(r => ({ ...r, [msgIndex]: { status: 'failed', reason: err.message } })))
        }

        if (intent.action === 'execute_swap' && pendingSwap) {
          executeSwap(pendingSwap.fromToken, pendingSwap.toToken, pendingSwap.amount, true, userAddress)
            .then(swapRes => {
              setTxResults(r => ({ ...r, [msgIndex]: { status: 'success', explorer: swapRes.explorer } }))
              setPendingSwap(null)
            })
            .catch((err: any) => setTxResults(r => ({ ...r, [msgIndex]: { status: 'failed', reason: err.message } })))
        }

        if (intent.action === 'pay' && intent.to && intent.amount) {
          const requestId = generateRequestId()
          executePay(intent.to, intent.amount, intent.reason || 'Chat payment', requestId, userAddress)
            .then(payRes => setTxResults(r => ({ ...r, [msgIndex]: payRes })))
            .catch((err: any) => setTxResults(r => ({ ...r, [msgIndex]: { status: 'failed', reason: err.message } })))
        }

        if (intent.action === 'schedule') {
          // On-chain schedule creation
          const interval = intent.interval || '86400' // Default 1 day in seconds
          const minBalance = intent.conditions?.minBalance || 0

          const handleOnChainSchedule = async () => {
            if (!window.ethereum) throw new Error("No wallet connected")
            const provider = new ethers.BrowserProvider(window.ethereum)
            const signer = await provider.getSigner()
            const vault = new ethers.Contract(VAULT_ADDRESS, VAULT_ABI, signer)
            
            setTxResults(r => ({ ...r, [msgIndex]: { status: 'pending', message: 'Sign in wallet...' } }))
            const tx = await vault.createSchedule(
              intent.to, 
              ethers.parseEther(intent.amount!.toString()), 
              Number(interval), 
              intent.reason || '',
              ethers.parseEther(minBalance.toString())
            )
            await tx.wait()
            return tx
          }

          handleOnChainSchedule()
            .then((tx) => setTxResults(r => ({ ...r, [msgIndex]: { status: 'success', message: 'Schedule created', explorer: 'https://shannon-explorer.somnia.network/tx/' + tx.hash } })))
            .catch((err: any) => setTxResults(r => ({ ...r, [msgIndex]: { status: 'failed', reason: err.message } })))
        }

        if (intent.action === 'update_policy') {
          setMessages(prev => [...prev, {
            role: 'assistant',
            content: 'To update your policy on-chain, please go to the "Account" -> "Policy Settings" tab. This ensures you sign the transaction directly with your wallet.',
            timestamp: Date.now()
          }])
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
              {msg.role === 'assistant' && txResults[i] && (
                <div style={{ marginTop: 10 }}>
                  <TxBadge result={txResults[i]} />
                  {txResults[i].status === 'proposed' && (
                    <div style={{ marginTop: 8, display: 'flex', gap: 8 }}>
                      <button 
                        className="send-btn" 
                        style={{ fontSize: 12, padding: '4px 12px' }}
                        onClick={() => handleSend('Yes, confirm swap')}
                      >
                        Confirm Swap
                      </button>
                      <button 
                        className="send-btn" 
                        style={{ fontSize: 12, padding: '4px 12px', background: 'transparent', border: '1px solid var(--border)' }}
                        onClick={() => { setPendingSwap(null); setTxResults(r => ({ ...r, [i]: { status: 'failed', reason: 'User cancelled' } })) }}
                      >
                        Cancel
                      </button>
                    </div>
                  )}
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
        {[
          { label: 'SEND', prompt: 'Send STT to ' },
          { label: 'SWAP', prompt: 'Swap STT to ' },
          { label: 'BALANCE', prompt: 'What is my vault balance?' },
          { label: 'POLICY', prompt: 'Show my current policy' },
        ].map(({ label, prompt }) => (
          <button
            key={label}
            className="quick-action-btn"
            onClick={() => {
              if (prompt.endsWith('?') || !prompt.endsWith(' ')) {
                handleSend(prompt)
              } else {
                setInput(prompt)
                inputRef.current?.focus()
              }
            }}
            disabled={loading}
          >
            {label}
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

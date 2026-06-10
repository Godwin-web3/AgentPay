import React, { useRef, useEffect } from 'react'
import { sendChat, executePay, executeSwap, executeIntent, generateRequestId, getPolicy, getChatHistory, getVaultAddress, RPC, TOKENS } from '../api'
import type { ChatMessage } from '../types'
import { ethers } from 'ethers'

interface Props {
  messages: ChatMessage[]
  setMessages: React.Dispatch<React.SetStateAction<ChatMessage[]>>
  userAddress: string
  onActionSuccess?: () => void
}

function formatTime(ts: number) {
  return new Date(ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
}

function ProofBadge({ requestId }: { requestId: string }) {
  return (
    <a 
      href={`https://shannon-explorer.somnia.network/address/0x037Bb9C718F3f7fe5eCBDB0b600D607b52706776`} 
      target="_blank" 
      rel="noreferrer"
      style={{
        marginTop: 8,
        padding: '6px 10px',
        background: 'rgba(0, 255, 255, 0.05)',
        border: '1px dashed var(--cyan)',
        borderRadius: 4,
        fontSize: 10,
        fontFamily: 'var(--font-mono)',
        color: 'var(--cyan)',
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        textDecoration: 'none'
      }}
    >
      <span style={{ fontSize: 14 }}>🛡️</span>
      <div style={{ flex: 1 }}>
        <div style={{ fontWeight: 'bold', marginBottom: 2 }}>DECENTRALIZED PROOF</div>
        <div style={{ color: 'var(--muted)' }}>Request ID: {requestId.slice(0, 16)}...</div>
      </div>
      <div style={{ 
        padding: '2px 6px', 
        background: 'var(--cyan)', 
        color: 'black', 
        borderRadius: 2, 
        fontWeight: 'bold',
        fontSize: 9
      }}>
        VERIFIED
      </div>
    </a>
  )
}

function TxBadge({ result, onConfirm, onCancel }: { result?: any, onConfirm?: () => void, onCancel?: () => void }) {
  const [confirming, setConfirming] = React.useState(false)
  if (!result) return null
  
  const isProposal = result.status === 'proposing_pay' || result.status === 'proposing_swap' || result.status === 'proposing_intent' || result.status === 'proposing_schedule'

  if (isProposal) {
    let title = 'TX PROPOSAL'
    let detail = ''
    if (result.status === 'proposing_pay') {
      title = '💸 PAYMENT PROPOSAL'
      detail = `Send ${result.amount} ${result.token || 'STT'} to ${result.to?.slice(0, 8)}...`
    } else if (result.status === 'proposing_swap') {
      title = '🔄 SWAP PROPOSAL'
      detail = `Swap ${result.amount} ${result.fromToken} → ${result.toToken}`
    } else if (result.status === 'proposing_intent') {
      title = '⚡ ATOMIC INTENT'
      detail = `${result.intentName?.replace(/_/g, ' ').toUpperCase()}${result.amount ? `: ${result.amount} STT` : ''}`
    } else if (result.status === 'proposing_schedule') {
      title = '⏰ ON-CHAIN SCHEDULE'
      detail = `Pay ${result.amount} STT to ${result.to?.slice(0, 8)}... every ${result.interval}`
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
    if (result.type === 'pay' || result.to) {
       feedback = `✓ Sent ${result.amount} ${result.token || 'STT'} to ${result.to?.slice(0, 10)}...`
    } else if (result.type === 'swap' || (result.fromToken && result.toToken)) {
       feedback = `✓ Swapped ${result.amount} ${result.fromToken} → ${result.toToken}`
    } else if (result.type === 'intent') {
       feedback = `✓ Intent executed`
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

export default function Terminal({ messages, setMessages, userAddress, onActionSuccess }: Props) {
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
        const payRes = await executePay(prop.to, prop.amount, prop.reason || 'Chat payment', requestId, userAddress, prop.token || 'STT')
        res = { ...payRes, type: 'pay', to: prop.to, amount: prop.amount, token: prop.token || 'STT' }
      }
 else if (prop.status === 'proposing_swap') {
        const swapRes = await executeSwap(prop.fromToken, prop.toToken, prop.amount, true, userAddress)
        res = { ...swapRes, type: 'swap', fromToken: prop.fromToken, toToken: prop.toToken, amount: prop.amount }
      } else if (prop.status === 'proposing_intent') {
        const intentRes = await executeIntent(prop.intentName, prop.amount, prop.to, prop.reason || 'Atomic Intent', userAddress)
        res = { ...intentRes, type: 'intent', intentName: prop.intentName }
      } else if (prop.status === 'proposing_schedule') {
        const { address: vaultAddr } = await getVaultAddress(userAddress)
        const iface = new ethers.Interface(["function createSchedule(address token, address to, uint256 amount, uint256 interval, string calldata reason, uint256 minBalance) external"])
        const amountWei = ethers.parseEther(prop.amount.toString())
        const intervalSec = parseInterval(prop.interval)
        const minBalWei = ethers.parseEther((prop.conditions?.minBalance || 0).toString())
        
        const data = iface.encodeFunctionData("createSchedule", [
          TOKENS.STT, prop.to, amountWei, intervalSec, prop.reason || '', minBalWei
        ])
        
        const txHash = await window.ethereum.request({
          method: 'eth_sendTransaction',
          params: [{ from: userAddress, to: vaultAddr, data }]
        })

        const provider = new ethers.JsonRpcProvider(RPC)
        await provider.waitForTransaction(txHash)

        res = { status: 'executed', txHash, explorer: 'https://shannon-explorer.somnia.network/tx/' + txHash, type: 'schedule', to: prop.to, amount: prop.amount }
      }
      
      if (res) {
        setTxResults(r => ({ ...r, [msgIdx]: res }))
        if ((res.status === 'executed' || res.status === 'success') && onActionSuccess) {
          setTimeout(() => onActionSuccess(), 3000)
        }
      }
    } catch (err: any) {
      setTxResults(r => ({ ...r, [msgIdx]: { status: 'failed', reason: err.message } }))
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
      const serverUrl = import.meta.env.VITE_WORKER_URL || 'https://agentpay-c4o7.onrender.com'
      await fetch(`${serverUrl}/chat`, {
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
      getVaultAddress(userAddress).then(({ address: vaultAddr }) => {
        fetch(RPC, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            jsonrpc: '2.0', id: 1, method: 'eth_call',
            params: [{ to: vaultAddr, data: '0xd4fac45d' + userAddress.replace('0x', '').toLowerCase().padStart(64, '0') + '0000000000000000000000000000000000000000000000000000000000000000' }, 'latest']
          })
        })
          .then(r => r.json())
          .then(data => {
            const bal = (Number(BigInt(data.result === '0x' || !data.result ? '0x0' : data.result)) / 1e18).toFixed(4)
            setMessages(prev => [...prev, {
              role: 'assistant',
              content: `Vault balance: ${bal} STT\nWorker: online\nPolicy: active`,
              timestamp: Date.now()
            }])
          })
          .catch(() => setMessages(prev => [...prev, { role: 'assistant', content: 'Failed to fetch status.', timestamp: Date.now() }]))
      })
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
            setTxResults(r => ({ 
              ...r, 
              [msgIndex]: { 
                status: 'proposing_pay', 
                to: intent.to, 
                amount: intent.amount, 
                token: intent.fromToken || 'STT',
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
            setTxResults(currentResults => {
              const lastPropIdx = [...next.keys()].reverse().find(idx => currentResults[idx]?.status.startsWith('proposing_'))
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
              const serverUrl = import.meta.env.VITE_WORKER_URL || 'https://agentpay-c4o7.onrender.com'
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
              return await fetch(`${serverUrl}/policy`, { method: "POST", headers: { "Content-Type": "application/json", "x-user-address": userAddress }, body: JSON.stringify(update) }).then(r => r.json())
            }
            applyPolicyUpdate()
              .then(() => {
                setTxResults(r => ({ ...r, [msgIndex]: { status: 'policy_updated' } }))
                if (onActionSuccess) onActionSuccess()
              })
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

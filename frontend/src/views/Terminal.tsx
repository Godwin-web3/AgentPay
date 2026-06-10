import React, { useRef, useEffect } from 'react'
import { sendChat, executePay, executeSwap, executeIntent, generateRequestId, getPolicy, getChatHistory, getVaultAddress, RPC, TOKENS } from '../api'
import type { ChatMessage } from '../types'
import { ethers } from 'ethers'

interface Props {
  messages: ChatMessage[]
  setMessages: React.Dispatch<React.SetStateAction<ChatMessage[]>>
  userAddress: string
  onActionSuccess?: () => void
  activeProvider?: any
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
      detail = `TO:     ${result.to}\nAMT:    ${result.amount} ${result.token || 'STT'}\nWHY:    ${result.reason || 'N/A'}`
    } else if (result.status === 'proposing_swap') {
      title = '🔄 SWAP PROPOSAL'
      detail = `FROM:   ${result.fromToken}\nTO:     ${result.toToken}\nAMT:    ${result.amount}`
    } else if (result.status === 'proposing_intent') {
      title = '⚡ ATOMIC INTENT'
      detail = `INTENT: ${result.intentName?.replace(/_/g, ' ').toUpperCase()}\nAMT:    ${result.amount} STT\nTO:     ${result.to || 'N/A'}`
    } else if (result.status === 'proposing_schedule') {
      title = '⏰ ON-CHAIN SCHEDULE'
      detail = `TO:     ${result.to}\nAMT:    ${result.amount} STT\nEVERY:  ${result.interval}`
    }

    return (
      <div style={{ 
        marginTop: 12, 
        border: '1px solid var(--cyan)', 
        background: 'rgba(79, 219, 200, 0.05)',
        fontFamily: 'var(--font-mono)',
        fontSize: 11
      }}>
        <div style={{ background: 'var(--cyan)', color: 'black', padding: '4px 8px', fontWeight: 'bold', letterSpacing: 1 }}>
          {title}
        </div>
        <div style={{ padding: '10px', whiteSpace: 'pre-wrap', color: 'var(--text)', borderBottom: '1px solid rgba(79, 219, 200, 0.2)' }}>
          {detail}
        </div>
        <div style={{ display: 'flex', gap: 0 }}>
          <button 
            disabled={confirming}
            onClick={async () => {
              setConfirming(true)
              if (onConfirm) await onConfirm()
              setConfirming(false)
            }}
            style={{ 
              flex: 1, 
              background: 'transparent', 
              color: 'var(--cyan)', 
              border: 'none', 
              borderRight: '1px solid rgba(79, 219, 200, 0.2)',
              padding: '8px', 
              fontSize: 10, 
              cursor: 'pointer', 
              fontWeight: 'bold',
              fontFamily: 'var(--font-mono)'
            }}
          >
            {confirming ? '[ EXECUTING... ]' : '[ CONFIRM ]'}
          </button>
          <button 
            disabled={confirming}
            onClick={onCancel}
            style={{ 
              flex: 1, 
              background: 'transparent', 
              color: 'var(--muted)', 
              border: 'none', 
              padding: '8px', 
              fontSize: 10, 
              cursor: 'pointer',
              fontFamily: 'var(--font-mono)'
            }}
          >
            [ CANCEL ]
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
        href={result.explorer} 
        target="_blank" 
        rel="noreferrer" 
        style={{ 
          display: 'block', 
          textDecoration: 'none', 
          fontFamily: 'var(--font-mono)', 
          fontSize: 10, 
          padding: '8px 12px',
          border: '1px solid var(--success)',
          background: 'rgba(79, 219, 200, 0.05)',
          marginTop: 8
        }}
      >
        <div style={{ color: 'var(--success)', fontWeight: 'bold', marginBottom: 2 }}>{feedback}</div>
        <div style={{ color: 'var(--muted)' }}>TX: {result.txHash?.slice(0, 24)}... ↗</div>
      </a>
    )
  }

  if (result.status === 'cancelled') {
    return <div style={{ border: '1px solid var(--border)', padding: '6px 10px', color: 'var(--muted)', fontSize: 10, fontFamily: 'var(--font-mono)', marginTop: 8 }}>❌ Operation cancelled.</div>
  }

  if (result.status === 'rejected') {
    return (
      <div style={{ border: '1px solid var(--danger)', background: 'rgba(255, 59, 92, 0.05)', padding: '10px', marginTop: 8, fontFamily: 'var(--font-mono)', fontSize: 11 }}>
        <div style={{ color: 'var(--danger)', fontWeight: 'bold', marginBottom: 4 }}>🚫 BLOCKED BY POLICY</div>
        <div style={{ color: 'var(--text)' }}>Reason: {result.reason}</div>
      </div>
    )
  }

  if (result.status === 'policy_updated') {
    return <div style={{ border: '1px solid var(--cyan)', padding: '8px', color: 'var(--cyan)', fontSize: 10, fontFamily: 'var(--font-mono)', marginTop: 8 }}>🛡️ Policy synchronized.</div>
  }

  if (result.status === 'failed') {
    return <div style={{ border: '1px solid var(--danger)', padding: '8px', color: 'var(--danger)', fontSize: 10, fontFamily: 'var(--font-mono)', marginTop: 8 }}>⚠️ ERROR: {result.reason}</div>
  }

  return null
}

function BalanceCard({ data }: { data: any }) {
  if (!data?.balances) return null
  return (
    <div style={{
      marginTop: 12,
      border: '1px solid var(--border)',
      background: 'rgba(255, 255, 255, 0.02)',
      fontFamily: 'var(--font-mono)',
      fontSize: 11,
      color: 'var(--text)'
    }}>
      <div style={{ borderBottom: '1px solid var(--border)', padding: '4px 10px', color: 'var(--cyan)', letterSpacing: 2, fontSize: 9 }}>
        ━━━━━━━━━━ ACCOUNT BALANCES ━━━━━━━━━━
      </div>
      <div style={{ padding: '10px' }}>
        {Object.entries(data.balances).map(([token, amt]) => (
          <div key={token} style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 2 }}>
            <span style={{ color: 'var(--muted)' }}>{token.padEnd(8, ' ')}</span>
            <span style={{ color: 'var(--cyan)' }}>{String(amt)}</span>
          </div>
        ))}
        {data.vault !== undefined && (
          <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 6, borderTop: '1px dashed var(--border)', paddingTop: 6 }}>
            <span style={{ color: 'var(--muted)' }}>VAULT (STT)</span>
            <span style={{ color: 'var(--cyan)', fontWeight: 'bold' }}>{data.vault}</span>
          </div>
        )}
      </div>
    </div>
  )
}

function PolicyCard({ data }: { data: any }) {
  if (!data?.perTxCap) return null
  return (
    <div style={{
      marginTop: 12,
      border: '1px solid var(--border)',
      background: 'rgba(255, 255, 255, 0.02)',
      fontFamily: 'var(--font-mono)',
      fontSize: 11,
      color: 'var(--text)'
    }}>
      <div style={{ borderBottom: '1px solid var(--border)', padding: '4px 10px', color: 'var(--cyan)', letterSpacing: 2, fontSize: 9 }}>
        ━━━━━━━━━━ SPENDING POLICY ━━━━━━━━━━
      </div>
      <div style={{ padding: '10px' }}>
        {[
          ['PER_TX_CAP', `${data.perTxCap} STT`],
          ['DAILY_CAP', `${data.dailyCap} STT`],
          ['SPENT_TODAY', `${data.dailySpendSoFar} STT`],
          ['REMAINING', `${data.dailyRemaining} STT`],
          ['STATUS', data.active !== false ? 'ACTIVE' : 'PAUSED'],
        ].map(([k, v]) => (
          <div key={k} style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 2 }}>
            <span style={{ color: 'var(--muted)' }}>{k.padEnd(12, ' ')}</span>
            <span style={{ color: k === 'STATUS' ? (data.active !== false ? 'var(--cyan)' : 'var(--danger)') : 'inherit' }}>{v}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

export default function Terminal({ messages, setMessages, userAddress, onActionSuccess, activeProvider }: Props) {
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
        
        const provider = activeProvider || window.ethereum
        const txHash = await provider.request({
          method: 'eth_sendTransaction',
          params: [{ from: userAddress, to: vaultAddr, data }]
        })

        const rpcProvider = new ethers.JsonRpcProvider(RPC)
        await rpcProvider.waitForTransaction(txHash)

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
      await clearChatHistory(userAddress).catch(() => {})
      setMessages([{ role: 'assistant', content: 'Memory cleared.', timestamp: Date.now() }])
      setInput('')
      return
    }

    // Natural Language Confirmations (Match CLI pendingSwap/pendingAction logic)
    const lowerText = text.toLowerCase()
    const isConfirm = ['yes', 'confirm', 'go ahead', 'yep', 'y'].includes(lowerText)
    const isCancel = ['no', 'cancel', 'nope', 'n'].includes(lowerText)

    if (isConfirm || isCancel) {
      // Find the last pending proposal
      const lastPropIdx = Object.keys(txResults)
        .map(Number)
        .sort((a, b) => b - a)
        .find(idx => txResults[idx]?.status.startsWith('proposing_'))

      if (lastPropIdx !== undefined) {
        const userMsg: ChatMessage = { role: 'user', content: text, timestamp: Date.now() }
        setMessages(prev => [...prev, userMsg])
        setInput('')
        if (isConfirm) {
          await handleConfirm(lastPropIdx)
        } else {
          handleCancel(lastPropIdx)
        }
        return
      }
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

        let newTxResult: any = null

        if (intent.action === 'pay' && intent.to && intent.amount) {
          newTxResult = { 
            status: 'proposing_pay', 
            to: intent.to, 
            amount: intent.amount, 
            token: intent.fromToken || 'STT',
            reason: intent.reason
          }
        } else if (intent.action === 'schedule' && intent.to && intent.amount && intent.interval) {
           newTxResult = { 
             status: 'proposing_schedule', 
             to: intent.to, 
             amount: intent.amount, 
             interval: intent.interval,
             reason: intent.reason,
             conditions: intent.conditions
           }
        } else if (intent.action === 'propose_swap' && intent.fromToken && intent.toToken && intent.amount) {
           newTxResult = { 
             status: 'proposing_swap', 
             fromToken: intent.fromToken, 
             toToken: intent.toToken, 
             amount: intent.amount 
           }
        } else if (intent.action === 'intent' && intent.intentName) {
           newTxResult = { 
             status: 'proposing_intent', 
             intentName: intent.intentName,
             amount: intent.amount, 
             to: intent.to, 
             reason: intent.reason || 'Atomic Intent'
           }
        }

        if (newTxResult) {
          setTxResults(r => ({ ...r, [msgIndex]: newTxResult }))
        }

        if (intent.action === 'execute_swap') {
          const lastPropIdx = Object.keys(txResults)
            .map(Number)
            .sort((a, b) => b - a)
            .find(idx => txResults[idx]?.status === 'proposing_swap')
          
          if (lastPropIdx !== undefined) {
             handleConfirm(lastPropIdx)
          }
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
            .then(() => {
              setTxResults(r => ({ ...r, [msgIndex]: { status: 'policy_updated' } }))
              if (onActionSuccess) onActionSuccess()
            })
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
      <div style={{ 
        marginBottom: 16, 
        paddingBottom: 8, 
        borderBottom: '1px solid var(--border)', 
        display: 'flex', 
        justifyContent: 'space-between', 
        alignItems: 'center',
        fontFamily: 'var(--font-mono)',
        fontSize: 10,
        color: 'var(--muted)',
        letterSpacing: 1
      }}>
        <span>TERMINAL_SESSION_01 // AGENTPAY_V2</span>
        <span style={{ color: 'var(--cyan)' }}>● ONLINE</span>
      </div>

      <div className="messages" ref={scrollRef}>
        {messages.map((msg, i) => (
          <div key={i} className={`message ${msg.role}`}>
            <div className="message-bubble">
              {msg.role === 'assistant' && (
                <div style={{ color: 'var(--cyan)', fontWeight: 'bold', marginBottom: 4, fontSize: 11 }}>
                  🤖 AGENTPAY:
                </div>
              )}
              <div style={{ whiteSpace: 'pre-wrap' }}>{msg.content}</div>
              
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
              fontSize: 9,
              color: 'var(--muted)',
              marginTop: 4,
              textAlign: msg.role === 'user' ? 'right' : 'left',
              fontFamily: 'var(--font-mono)',
              opacity: 0.6
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
          placeholder="ENTER COMMAND..."
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

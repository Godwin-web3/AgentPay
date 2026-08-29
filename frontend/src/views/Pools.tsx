import { useEffect, useRef, useState } from 'react'
import {
  listMyPools, parsePoolCreation, createPool, getPool, acceptPoolInvite,
  listPoolProposals, vetoProposal, sendPoolChatMessage, getPoolChat,
} from '../api'
import type { Pool, PoolProposal, PoolChatMessage, PoolCreationDraft } from '../types'
import LivingPool from '../components/LivingPool'

function formatTime(ts: string) {
  return new Date(ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
}

export default function Pools({ userAddress, userId }: { userAddress: string, userId: string }) {
  const [pools, setPools] = useState<Pool[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [selectedPool, setSelectedPool] = useState<Pool | null>(null)
  const [proposals, setProposals] = useState<PoolProposal[]>([])
  const [vetoingId, setVetoingId] = useState<string | null>(null)
  const [actionError, setActionError] = useState('')

  const [showCreate, setShowCreate] = useState(false)
  const [description, setDescription] = useState('')
  const [drafting, setDrafting] = useState(false)
  const [draft, setDraft] = useState<PoolCreationDraft | null>(null)
  const [creating, setCreating] = useState(false)

  const [messages, setMessages] = useState<PoolChatMessage[]>([])
  const [chatInput, setChatInput] = useState('')
  const [sending, setSending] = useState(false)
  const scrollRef = useRef<HTMLDivElement>(null)

  async function fetchPools() {
    setLoading(true)
    setError('')
    try {
      setPools(await listMyPools(userId))
    } catch {
      setError('Failed to load pools')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { fetchPools() }, [userId])

  async function fetchSelected(poolId: string) {
    let pool: Pool
    try {
      pool = await getPool(poolId, userId)
      setSelectedPool(pool)
      setActionError('')
    } catch (e: any) {
      setActionError(e.message || `Could not load pool ${poolId}`)
      return
    }
    try {
      const proposalRows = await listPoolProposals(poolId, userId)
      setProposals(
        proposalRows
          .map((r) => r.onChain)
          .filter((p): p is PoolProposal => !!p)
          .map((p) => ({ ...p, objectionWindowSeconds: pool.constitution.objectionWindow }))
      )
    } catch (e: any) {
      console.error('Failed to load pool proposals:', e.message)
    }
    try {
      setMessages(await getPoolChat(poolId, userId))
    } catch (e: any) {
      console.error('Failed to load pool chat:', e.message)
    }
  }

  useEffect(() => {
    if (!selectedId) return
    fetchSelected(selectedId)
    const t = setInterval(() => fetchSelected(selectedId), 4000)
    return () => clearInterval(t)
  }, [selectedId, userId])

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight })
  }, [messages])

  async function handleDraft() {
    if (!description.trim() || drafting) return
    setDrafting(true)
    setActionError('')
    try {
      setDraft(await parsePoolCreation(description.trim(), userId))
    } catch (e: any) {
      setActionError(e.message || 'Could not turn that into a pool')
    } finally {
      setDrafting(false)
    }
  }

  async function handleConfirmCreate() {
    if (!draft || creating) return
    setCreating(true)
    setActionError('')
    try {
      const constitution = {
        discretionaryThreshold: draft.constitution.discretionaryThreshold,
        objectionWindow: Math.round(draft.constitution.objectionWindowHours * 3600),
        maxSingleProposal: draft.constitution.maxSingleProposal,
      }
      const result = await createPool(draft.name, draft.invites, constitution, userId)
      setShowCreate(false)
      setDescription('')
      setDraft(null)
      await fetchPools()
      setSelectedId(result.poolId)
    } catch (e: any) {
      setActionError(e.message || 'Could not create pool')
    } finally {
      setCreating(false)
    }
  }

  async function handleAccept(poolId: string) {
    setActionError('')
    try {
      await acceptPoolInvite(poolId, userId)
      await fetchPools()
      await fetchSelected(poolId)
    } catch (e: any) {
      setActionError(e.message || 'Could not accept invite')
    }
  }

  async function handleVeto(proposalId: string) {
    setVetoingId(proposalId)
    setActionError('')
    try {
      await vetoProposal(proposalId, userId)
      if (selectedId) await fetchSelected(selectedId)
    } catch (e: any) {
      setActionError(e.message || 'Objection failed')
    } finally {
      setVetoingId(null)
    }
  }

  async function handleSendMessage() {
    if (!selectedId || !chatInput.trim() || sending) return
    const text = chatInput.trim()
    setChatInput('')
    setSending(true)
    setActionError('')
    try {
      await sendPoolChatMessage(selectedId, text, userId)
      await fetchSelected(selectedId)
    } catch (e: any) {
      setActionError(e.message || 'Message failed to send')
    } finally {
      setSending(false)
    }
  }

  const liveProposalIds = new Set(proposals.filter((p) => !p.resolved && !p.vetoed).map((p) => p.proposalId))

  return (
    <div className="view-container" style={{ padding: 20 }}>
      <div className="reveal" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', marginBottom: 24 }}>
        <div>
          <p className="eyebrow">Shared money, witnessed</p>
          <h2 className="page-title">Pools</h2>
        </div>
        <button className="send-btn" onClick={() => { setShowCreate((v) => !v); setDraft(null) }} style={{ width: 'auto', padding: '0 15px' }}>
          {showCreate ? 'Cancel' : 'Create Pool'}
        </button>
      </div>

      {showCreate && (
        <div className="card-deep reveal" style={{ marginBottom: 24, padding: 24 }}>
          {!draft ? (
            <>
              <div className="section-title">Describe your pool</div>
              <div style={{ fontSize: 12, color: 'var(--muted)', marginBottom: 12 }}>
                e.g. "Apartment 4B with @mike and @sarah, cap discretionary spend at $50, give everyone 4 hours to object"
              </div>
              <div style={{ display: 'flex', gap: 10 }}>
                <input
                  className="chat-input"
                  style={{ background: 'var(--bg)', borderBottom: '1px solid var(--border)', flex: 1 }}
                  placeholder="Describe who's in it and the rules..."
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter') handleDraft() }}
                />
                <button className="send-btn" onClick={handleDraft} disabled={drafting || !description.trim()} style={{ width: 'auto', padding: '0 15px' }}>
                  {drafting ? 'Thinking...' : 'Draft'}
                </button>
              </div>
            </>
          ) : (
            <>
              <h3 style={{ fontFamily: 'var(--font-head)', fontWeight: 600, fontSize: 22, margin: '0 0 10px' }}>{draft.name}</h3>
              <div style={{ fontSize: 13.5, marginBottom: 16, lineHeight: 1.5 }}>{draft.message}</div>
              <div className="mono-data" style={{ fontSize: 11.5, color: 'var(--muted)', marginBottom: 6 }}>
                Invites: {draft.invites.length ? draft.invites.join(', ') : 'none yet'}
              </div>
              <div className="mono-data" style={{ fontSize: 11.5, color: 'var(--muted)', marginBottom: 20 }}>
                Under {draft.constitution.discretionaryThreshold} USDC executes instantly · sealed after {draft.constitution.objectionWindowHours}h unless objected · never more than {draft.constitution.maxSingleProposal} USDC per proposal
              </div>
              <div style={{ display: 'flex', gap: 10 }}>
                <button className="send-btn" onClick={handleConfirmCreate} disabled={creating}>{creating ? 'Creating...' : 'Looks good, create it'}</button>
                <button className="send-btn" style={{ background: 'var(--muted)' }} onClick={() => setDraft(null)}>Start over</button>
              </div>
            </>
          )}
        </div>
      )}

      {error && <div className="alert danger" style={{ marginBottom: 20 }}>{error}</div>}
      {actionError && <div className="alert danger" style={{ marginBottom: 20 }}>{actionError}</div>}

      <div style={{ display: 'flex', gap: 20, flexWrap: 'wrap' }}>
        <div style={{ minWidth: 220 }}>
          {loading && pools.length === 0 ? (
            <div className="empty-state">Loading pools...</div>
          ) : pools.length === 0 ? (
            <div className="card" style={{ textAlign: 'center', padding: '20px' }}>
              <div style={{ color: 'var(--muted)', fontSize: 12 }}>No pools yet. Describe one above to share money with rules everyone agreed to.</div>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {pools.map((p) => (
                <div
                  key={p.poolId}
                  onClick={() => setSelectedId(p.poolId)}
                  className="card reveal"
                  style={{ padding: '12px 16px', cursor: 'pointer', border: selectedId === p.poolId ? '1px solid var(--cyan)' : '1px solid var(--border)' }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
                    <div style={{ fontFamily: 'var(--font-head)', fontWeight: 600, fontSize: 16 }}>{p.name || `Pool #${p.poolId}`}</div>
                    <span className="mono-data" style={{ fontSize: 9, letterSpacing: '0.08em', textTransform: 'uppercase', color: p.myStatus === 'Active' ? 'var(--cyan)' : 'var(--muted)', border: '1px solid var(--border-hot)', padding: '2px 8px', borderRadius: 20, flexShrink: 0 }}>
                      {p.myStatus}
                    </span>
                  </div>
                  {p.myStatus === 'Invited' && (
                    <button className="send-btn" style={{ width: 'auto', padding: '3px 10px', fontSize: 10, marginTop: 8 }} onClick={(e) => { e.stopPropagation(); handleAccept(p.poolId) }}>
                      Accept invite
                    </button>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>

        {selectedPool && (
          <div className="card-deep reveal" style={{ flex: 1, minWidth: 320, display: 'flex', flexDirection: 'column', padding: 32 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12, marginBottom: 6 }}>
              <h3 style={{ fontFamily: 'var(--font-head)', fontWeight: 600, fontSize: 26, margin: 0 }}>{selectedPool.name || `Pool #${selectedPool.poolId}`}</h3>
              <span className="mono-data" style={{ fontSize: 10, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--cyan)', border: '1px solid var(--border-hot)', padding: '4px 10px', borderRadius: 20, flexShrink: 0, whiteSpace: 'nowrap' }}>
                {selectedPool.active ? 'Active' : 'Inactive'} · {selectedPool.memberList.length} member{selectedPool.memberList.length === 1 ? '' : 's'}
              </span>
            </div>
            <p className="mono-data" style={{ fontSize: 11, color: 'var(--muted)', marginBottom: 28 }}>
              {selectedPool.memberList.map((a) => `${a.slice(0, 6)}…${a.slice(-4)}`).join(' · ')}
            </p>
            <LivingPool
              members={selectedPool.memberList}
              sharedBalance={selectedPool.sharedBalance}
              proposals={proposals}
              currentUserAddress={userAddress}
              onVeto={handleVeto}
              vetoingId={vetoingId}
            />

            {selectedPool.myStatus === 'Active' && (
              <div style={{ marginTop: 20, display: 'flex', flexDirection: 'column' }}>
                <div ref={scrollRef} style={{ maxHeight: 320, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 10, padding: '4px 2px' }}>
                  {messages.length === 0 && (
                    <div style={{ fontSize: 12, color: 'var(--muted)', textAlign: 'center', padding: '12px 0' }}>
                      Talk to the pool — "send $50 to @mike for groceries", "contribute 20 USDC", "raise the discretionary cap to $100"...
                    </div>
                  )}
                  {messages.map((m) => (
                    <div key={m.id} style={{ alignSelf: m.role === 'user' ? 'flex-end' : 'flex-start', maxWidth: '85%' }}>
                      <div style={{ fontSize: 9, letterSpacing: 1, marginBottom: 3, color: m.role === 'user' ? 'var(--muted)' : 'var(--cyan)', fontFamily: 'var(--font-mono)', textAlign: m.role === 'user' ? 'right' : 'left' }}>
                        {m.role === 'user' ? (m.authorAddress === userAddress ? 'YOU' : m.authorAddress?.slice(0, 8)) : m.role === 'system' ? 'POOL' : 'AP'} — {formatTime(m.timestamp)}
                      </div>
                      <div style={{
                        padding: m.messageType === 'proposal' ? '12px 14px' : '9px 13px',
                        borderRadius: 8, fontSize: 13.5, lineHeight: 1.45,
                        background: m.messageType === 'proposal'
                          ? 'linear-gradient(180deg, var(--bg-hover), #171A1E)'
                          : m.role === 'user' ? 'var(--cyan)' : m.messageType === 'system' ? 'transparent' : 'var(--bg)',
                        color: m.role === 'user' && m.messageType !== 'proposal' ? '#17140A' : m.messageType === 'system' ? 'var(--muted)' : 'var(--text)',
                        border: m.messageType === 'proposal' ? '1px solid var(--border-hot)' : m.messageType === 'system' ? 'none' : m.role === 'user' ? 'none' : '1px solid var(--border)',
                        fontStyle: m.messageType === 'system' ? 'italic' : 'normal',
                      }}>
                        {m.content}
                        {m.messageType === 'proposal' && m.proposalId && liveProposalIds.has(m.proposalId) && (
                          <div style={{ marginTop: 10 }}>
                            <button
                              className="send-btn"
                              style={{ width: 'auto', padding: '4px 13px', fontSize: 11, background: 'transparent', color: 'var(--danger)', border: '1px solid var(--danger)' }}
                              disabled={vetoingId === m.proposalId}
                              onClick={() => handleVeto(m.proposalId!)}
                            >
                              {vetoingId === m.proposalId ? 'Objecting…' : '✕ Object'}
                            </button>
                          </div>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
                <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
                  <input
                    className="chat-input"
                    style={{ background: 'var(--bg)', borderBottom: '1px solid var(--border)', flex: 1 }}
                    placeholder="Talk to the pool..."
                    value={chatInput}
                    onChange={(e) => setChatInput(e.target.value)}
                    onKeyDown={(e) => { if (e.key === 'Enter') handleSendMessage() }}
                    disabled={sending}
                  />
                  <button className="send-btn" onClick={handleSendMessage} disabled={sending || !chatInput.trim()} style={{ width: 'auto', padding: '0 14px' }}>
                    {sending ? '...' : 'Send'}
                  </button>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

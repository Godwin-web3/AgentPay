import { useEffect, useState } from 'react'
import {
  listMyPools, createPool, getPool, acceptPoolInvite, contributeToPool,
  proposeSpendInPool, listPoolProposals, vetoProposal,
} from '../api'
import type { Pool, PoolProposal } from '../types'
import LivingPool from '../components/LivingPool'

export default function Pools({ userAddress, userId }: { userAddress: string, userId: string }) {
  const [pools, setPools] = useState<Pool[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [selectedPool, setSelectedPool] = useState<Pool | null>(null)
  const [proposals, setProposals] = useState<PoolProposal[]>([])
  const [vetoingId, setVetoingId] = useState<string | null>(null)

  const [showCreate, setShowCreate] = useState(false)
  const [name, setName] = useState('')
  const [invitesText, setInvitesText] = useState('')
  const [discretionaryThreshold, setDiscretionaryThreshold] = useState('50')
  const [objectionWindowHours, setObjectionWindowHours] = useState('4')
  const [maxSingleProposal, setMaxSingleProposal] = useState('1000')
  const [creating, setCreating] = useState(false)

  const [contributeAmount, setContributeAmount] = useState('')
  const [contributing, setContributing] = useState(false)
  const [spendTo, setSpendTo] = useState('')
  const [spendAmount, setSpendAmount] = useState('')
  const [spendReason, setSpendReason] = useState('')
  const [proposing, setProposing] = useState(false)
  const [actionError, setActionError] = useState('')

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
    try {
      const [pool, proposalRows] = await Promise.all([getPool(poolId, userId), listPoolProposals(poolId, userId)])
      setSelectedPool(pool)
      setProposals(
        proposalRows
          .map((r) => r.onChain)
          .filter((p): p is PoolProposal => !!p)
          .map((p) => ({ ...p, objectionWindowSeconds: pool.constitution.objectionWindow }))
      )
    } catch {
      // transient poll failure — keep showing the last good state
    }
  }

  useEffect(() => {
    if (!selectedId) return
    fetchSelected(selectedId)
    const t = setInterval(() => fetchSelected(selectedId), 5000)
    return () => clearInterval(t)
  }, [selectedId, userId])

  async function handleCreate() {
    if (!name.trim() || creating) return
    setCreating(true)
    setActionError('')
    try {
      const invites = invitesText.split(',').map((s) => s.trim()).filter(Boolean)
      const constitution = {
        discretionaryThreshold: Number(discretionaryThreshold),
        objectionWindow: Math.round(Number(objectionWindowHours) * 3600),
        maxSingleProposal: Number(maxSingleProposal),
      }
      const result = await createPool(name.trim(), invites, constitution, userId)
      setShowCreate(false)
      setName(''); setInvitesText('')
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

  async function handleContribute() {
    if (!selectedId || !(Number(contributeAmount) > 0) || contributing) return
    setContributing(true)
    setActionError('')
    try {
      await contributeToPool(selectedId, Number(contributeAmount), true, userId)
      setContributeAmount('')
      await fetchSelected(selectedId)
    } catch (e: any) {
      setActionError(e.message || 'Contribution failed')
    } finally {
      setContributing(false)
    }
  }

  async function handleProposeSpend() {
    if (!selectedId || !spendTo.trim() || !(Number(spendAmount) > 0) || proposing) return
    setProposing(true)
    setActionError('')
    try {
      await proposeSpendInPool(selectedId, spendTo.trim(), Number(spendAmount), spendReason, userId)
      setSpendTo(''); setSpendAmount(''); setSpendReason('')
      await fetchSelected(selectedId)
    } catch (e: any) {
      setActionError(e.message || 'Proposal failed')
    } finally {
      setProposing(false)
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

  return (
    <div className="view-container" style={{ padding: 20 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <h2 style={{ margin: 0 }}>Pools</h2>
        <button className="send-btn" onClick={() => setShowCreate((v) => !v)} style={{ width: 'auto', padding: '0 15px' }}>
          {showCreate ? 'Cancel' : 'Create Pool'}
        </button>
      </div>

      {showCreate && (
        <div className="card" style={{ marginBottom: 24 }}>
          <div className="section-title">New pool</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <input className="chat-input" style={{ background: 'var(--bg)', borderBottom: '1px solid var(--border)' }} placeholder="Pool name (e.g. Apartment 4B)" value={name} onChange={(e) => setName(e.target.value)} />
            <input className="chat-input" style={{ background: 'var(--bg)', borderBottom: '1px solid var(--border)' }} placeholder="Invite @tags or addresses, comma-separated" value={invitesText} onChange={(e) => setInvitesText(e.target.value)} />
            <div style={{ display: 'flex', gap: 10 }}>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 10, color: 'var(--muted)', marginBottom: 4 }}>Discretionary threshold (USDC)</div>
                <input className="chat-input" style={{ background: 'var(--bg)', borderBottom: '1px solid var(--border)', width: '100%' }} value={discretionaryThreshold} onChange={(e) => setDiscretionaryThreshold(e.target.value)} />
              </div>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 10, color: 'var(--muted)', marginBottom: 4 }}>Objection window (hours)</div>
                <input className="chat-input" style={{ background: 'var(--bg)', borderBottom: '1px solid var(--border)', width: '100%' }} value={objectionWindowHours} onChange={(e) => setObjectionWindowHours(e.target.value)} />
              </div>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 10, color: 'var(--muted)', marginBottom: 4 }}>Backstop cap (USDC)</div>
                <input className="chat-input" style={{ background: 'var(--bg)', borderBottom: '1px solid var(--border)', width: '100%' }} value={maxSingleProposal} onChange={(e) => setMaxSingleProposal(e.target.value)} />
              </div>
            </div>
            <button className="send-btn" onClick={handleCreate} disabled={creating || !name.trim()}>{creating ? 'Creating...' : 'Create'}</button>
          </div>
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
              <div style={{ color: 'var(--muted)', fontSize: 12 }}>No pools yet. Create one to share money with rules everyone agreed to.</div>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {pools.map((p) => (
                <div
                  key={p.poolId}
                  onClick={() => setSelectedId(p.poolId)}
                  className="card"
                  style={{ padding: '10px 14px', cursor: 'pointer', border: selectedId === p.poolId ? '1px solid var(--cyan)' : undefined }}
                >
                  <div style={{ fontWeight: 600 }}>{p.name || `Pool #${p.poolId}`}</div>
                  <div style={{ fontSize: 10, color: 'var(--muted)', textTransform: 'uppercase' }}>{p.myStatus}</div>
                  {p.myStatus === 'Invited' && (
                    <button className="send-btn" style={{ width: 'auto', padding: '3px 10px', fontSize: 10, marginTop: 6 }} onClick={(e) => { e.stopPropagation(); handleAccept(p.poolId) }}>
                      Accept invite
                    </button>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>

        {selectedPool && (
          <div className="card" style={{ flex: 1, minWidth: 320 }}>
            <div className="section-title">{selectedPool.name || `Pool #${selectedPool.poolId}`}</div>
            <LivingPool
              members={selectedPool.memberList}
              sharedBalance={selectedPool.sharedBalance}
              proposals={proposals}
              currentUserAddress={userAddress}
              onVeto={handleVeto}
              vetoingId={vetoingId}
            />

            {selectedPool.myStatus === 'Active' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 16, marginTop: 20 }}>
                <div>
                  <div style={{ fontSize: 11, color: 'var(--muted)', textTransform: 'uppercase', marginBottom: 6 }}>Contribute to shared pool</div>
                  <div style={{ display: 'flex', gap: 8 }}>
                    <input className="chat-input" style={{ background: 'var(--bg)', borderBottom: '1px solid var(--border)', flex: 1 }} placeholder="Amount (USDC)" value={contributeAmount} onChange={(e) => setContributeAmount(e.target.value)} />
                    <button className="send-btn" style={{ width: 'auto', padding: '0 14px' }} onClick={handleContribute} disabled={contributing}>{contributing ? '...' : 'Contribute'}</button>
                  </div>
                </div>

                <div>
                  <div style={{ fontSize: 11, color: 'var(--muted)', textTransform: 'uppercase', marginBottom: 6 }}>Propose a spend</div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                    <input className="chat-input" style={{ background: 'var(--bg)', borderBottom: '1px solid var(--border)' }} placeholder="To (0x... or @tag)" value={spendTo} onChange={(e) => setSpendTo(e.target.value)} />
                    <div style={{ display: 'flex', gap: 8 }}>
                      <input className="chat-input" style={{ background: 'var(--bg)', borderBottom: '1px solid var(--border)', flex: 1 }} placeholder="Amount (USDC)" value={spendAmount} onChange={(e) => setSpendAmount(e.target.value)} />
                      <input className="chat-input" style={{ background: 'var(--bg)', borderBottom: '1px solid var(--border)', flex: 2 }} placeholder="Reason" value={spendReason} onChange={(e) => setSpendReason(e.target.value)} />
                    </div>
                    <button className="send-btn" onClick={handleProposeSpend} disabled={proposing}>{proposing ? 'Proposing...' : 'Propose'}</button>
                    <div style={{ fontSize: 10, color: 'var(--muted)' }}>
                      Under {selectedPool.constitution.discretionaryThreshold} USDC executes immediately. Above it, every member sees it and can object for {(selectedPool.constitution.objectionWindow / 3600).toFixed(1)}h.
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

import { useEffect, useState } from 'react'
import { createIntentPlan, listIntentPlans, getDecision, makeDecisionRequestId } from '../api'
import type { IntentPlan, IntentStep, DecisionRecord } from '../types'

const STATUS_COLOR: Record<string, string> = {
  active: 'var(--cyan)',
  completed: 'var(--cyan)',
  failed: 'var(--danger)',
  waiting: 'var(--muted)',
  done: 'var(--cyan)',
  pending: 'var(--muted)',
}

function stepStatus(plan: IntentPlan, idx: number): 'pending' | 'waiting' | 'done' | 'failed' {
  const entries = plan.log.filter(l => l.step === idx)
  if (entries.length === 0) return 'pending'
  return entries[entries.length - 1].status
}

function stepLabel(step: IntentStep): string {
  switch (step.type) {
    case 'pay': return `Pay ${step.amount} USDC to ${step.to}`
    case 'hire_agent': return `Hire an agent: ${step.description} (${step.budget} USDC)`
    case 'check_balance': return `Wait until vault balance ≥ ${step.minBalance} USDC`
    case 'wait_for_condition': return `Wait for condition: ${JSON.stringify(step.condition)}`
    default: return step.type
  }
}

function Badge({ status }: { status: string }) {
  return (
    <div style={{
      fontSize: 10,
      padding: '2px 6px',
      borderRadius: 4,
      background: 'rgba(255,255,255,0.05)',
      color: STATUS_COLOR[status] || 'var(--muted)',
      border: '1px solid currentColor',
      textTransform: 'uppercase',
      whiteSpace: 'nowrap',
    }}>
      {status}
    </div>
  )
}

function DecisionPanel({ planId, stepIndex, userId }: { planId: string, stepIndex: number, userId: string }) {
  const [state, setState] = useState<'idle' | 'loading' | 'error'>('idle')
  const [decision, setDecision] = useState<DecisionRecord | null>(null)
  const [error, setError] = useState('')

  async function load() {
    setState('loading')
    setError('')
    try {
      const requestId = await makeDecisionRequestId(planId, stepIndex)
      const d = await getDecision(requestId, userId)
      setDecision(d)
      setState('idle')
    } catch (e: any) {
      setError(e.message || 'DecisionLog not available (not deployed, or this step predates it)')
      setState('error')
    }
  }

  if (state === 'idle' && !decision) {
    return (
      <button className="send-btn" onClick={load} style={{ width: 'auto', padding: '3px 10px', fontSize: 10 }}>
        View on-chain decision
      </button>
    )
  }
  if (state === 'loading') return <div style={{ fontSize: 11, color: 'var(--muted)' }}>Loading decision record...</div>
  if (state === 'error') return <div style={{ fontSize: 11, color: 'var(--danger)' }}>{error}</div>

  return (
    <div style={{ fontSize: 11, fontFamily: 'var(--font-mono)', background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 4, padding: 8, marginTop: 6 }}>
      <div>summary: {decision!.summary}</div>
      <div>committed at block: {decision!.committedBlock}</div>
      <div>finalized: {decision!.finalized ? 'yes' : 'no'}</div>
      <div style={{ wordBreak: 'break-all' }}>decisionHash: {decision!.decisionHash}</div>
    </div>
  )
}

function PlanCard({ plan, userId }: { plan: IntentPlan, userId: string }) {
  const [expanded, setExpanded] = useState(plan.status !== 'completed')

  return (
    <div className="card" style={{ marginBottom: 16 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12, marginBottom: 12 }}>
        <div style={{ fontSize: 13, flex: 1 }}>{plan.goal}</div>
        <Badge status={plan.status} />
      </div>

      <div style={{ fontSize: 11, color: 'var(--muted)', marginBottom: 10 }}>
        Step {Math.min(plan.cursor + 1, plan.steps.length)} of {plan.steps.length}
        {plan.error ? ` — ${plan.error}` : ''}
      </div>

      <button
        onClick={() => setExpanded(e => !e)}
        style={{ background: 'none', border: 'none', color: 'var(--cyan)', cursor: 'pointer', fontSize: 11, padding: 0, marginBottom: expanded ? 10 : 0 }}
      >
        {expanded ? 'Hide steps ▴' : 'Show steps ▾'}
      </button>

      {expanded && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {plan.steps.map((step, idx) => {
            const status = stepStatus(plan, idx)
            const isMoneyStep = step.type === 'pay' || step.type === 'hire_agent'
            return (
              <div key={idx} style={{ padding: '8px 12px', background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 4 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
                  <div style={{ fontSize: 12 }}>{stepLabel(step)}</div>
                  <Badge status={status} />
                </div>
                {isMoneyStep && status === 'done' && (
                  <div style={{ marginTop: 6 }}>
                    <DecisionPanel planId={plan.id} stepIndex={idx} userId={userId} />
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

export default function Goals({ userId }: { userAddress: string, userId: string }) {
  const [plans, setPlans] = useState<IntentPlan[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [goal, setGoal] = useState('')
  const [submitting, setSubmitting] = useState(false)

  async function fetchPlans() {
    setLoading(true)
    setError('')
    try {
      const res = await listIntentPlans(userId)
      setPlans(res)
    } catch {
      setError('Failed to load goals')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { fetchPlans() }, [userId])

  async function handleSubmit() {
    if (!goal.trim() || submitting) return
    setSubmitting(true)
    setError('')
    try {
      const plan = await createIntentPlan(goal.trim(), userId)
      setPlans(prev => [plan, ...prev])
      setGoal('')
    } catch (e: any) {
      setError(e.message || 'Could not turn that into a plan')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="view-container" style={{ padding: 20 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <h2 style={{ margin: 0 }}>Goals</h2>
        <button className="send-btn" onClick={fetchPlans} style={{ width: 'auto', padding: '0 15px' }}>Refresh</button>
      </div>

      <div className="card" style={{ marginBottom: 24 }}>
        <div className="section-title">State a goal, not a command</div>
        <div style={{ fontSize: 12, color: 'var(--muted)', marginBottom: 12 }}>
          e.g. "pay 0xabc... 10 USDC once my balance is above 500" or "hire an agent to summarize the latest Arc testnet docs for 2 USDC".
          The solver breaks it into steps and runs them through your policy-enforced vault — see the Goals README section for exactly which primitives it can use.
        </div>
        <div style={{ display: 'flex', gap: 10 }}>
          <input
            type="text"
            className="chat-input"
            style={{ background: 'var(--bg)', borderBottom: '1px solid var(--border)', flex: 1 }}
            placeholder="Describe what you want to happen..."
            value={goal}
            onChange={e => setGoal(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') handleSubmit() }}
          />
          <button className="send-btn" onClick={handleSubmit} disabled={submitting || !goal.trim()} style={{ width: 'auto', padding: '0 15px' }}>
            {submitting ? 'Planning...' : 'Set Goal'}
          </button>
        </div>
      </div>

      {error && <div className="alert danger" style={{ marginBottom: 20 }}>{error}</div>}

      {loading && plans.length === 0 ? (
        <div className="empty-state">Loading goals...</div>
      ) : plans.length === 0 ? (
        <div className="card" style={{ textAlign: 'center', padding: '30px 20px' }}>
          <div style={{ color: 'var(--muted)' }}>No goals yet. State one above to see it planned and executed.</div>
        </div>
      ) : (
        plans.map(plan => <PlanCard key={plan.id} plan={plan} userId={userId} />)
      )}
    </div>
  )
}

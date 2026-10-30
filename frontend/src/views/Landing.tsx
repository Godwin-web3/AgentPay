import { useState, useEffect } from 'react'
import PoolsAmbientCanvas from '../components/PoolsAmbientCanvas'

const DEMO_LINES = [
  { role: 'user', text: 'request 25 USDC from @alex for the invoice', delay: 300 },
  { role: 'agent', text: 'Created payment request. Share link ready.', delay: 900 },
  { role: 'user', text: 'send 5 USDC to @sara', delay: 1600 },
  { role: 'agent', text: 'Checking AgentVault policy...', delay: 2200 },
  { role: 'agent', text: 'Per-tx cap: $10. Recipient allowed.', delay: 2800 },
  { role: 'agent', text: '[OK] Settled via AgentVault. Receipt recorded.', delay: 3400 },
  { role: 'user', text: 'send 500 USDC to unknown', delay: 4200 },
  { role: 'agent', text: '[BLOCKED] Exceeds per-tx cap. Vault reverted.', delay: 4800, blocked: true },
]

function DemoTerminal() {
  const [visible, setVisible] = useState(0)

  useEffect(() => {
    const timers = DEMO_LINES.map((line, i) =>
      setTimeout(() => setVisible(i + 1), line.delay)
    )
    const reset = setTimeout(() => setVisible(0), 7500)
    return () => { timers.forEach(clearTimeout); clearTimeout(reset) }
  }, [visible === 0 ? 0 : undefined])

  return (
    <div style={{
      background: 'var(--bg)',
      border: '1px solid var(--border)',
      borderRadius: 6,
      fontFamily: 'var(--font-mono)',
      fontSize: 12,
      width: '100%',
      overflow: 'hidden',
    }}>
      <div style={{
        padding: '9px 14px',
        borderBottom: '1px solid var(--border)',
        background: 'var(--bg-card)',
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center'
      }}>
        <span style={{ color: 'var(--cyan)', fontSize: 10, letterSpacing: 2 }}>AGENTPAY</span>
        <span style={{ color: 'var(--muted)', fontSize: 9, opacity: 0.6 }}>ARC</span>
      </div>
      <div style={{ padding: '14px 12px', display: 'flex', flexDirection: 'column', gap: 8, minHeight: 220 }}>
        {DEMO_LINES.slice(0, visible).map((line, i) => (
          <div key={i} style={{ display: 'flex', justifyContent: line.role === 'user' ? 'flex-end' : 'flex-start' }}>
            <div style={{
              maxWidth: '85%',
              padding: '7px 11px',
              borderRadius: 6,
              background: line.role === 'user' ? 'var(--cyan-a1)' : (line.blocked ? 'var(--danger-a1)' : 'var(--bg-card)'),
              border: `1px solid ${line.role === 'user' ? 'var(--border-hot)' : (line.blocked ? 'var(--danger-a2)' : 'var(--border)')}`,
              color: line.blocked ? 'var(--danger)' : (line.role === 'user' ? 'var(--cyan)' : 'var(--text)'),
              lineHeight: 1.5,
            }}>
              {line.text}
            </div>
          </div>
        ))}
        {visible > 0 && visible < DEMO_LINES.length && (
          <div style={{ display: 'flex', gap: 4, padding: '4px 0' }}>
            {[0, 1, 2].map(i => (
              <span key={i} style={{
                width: 5, height: 5, background: 'var(--cyan)', display: 'inline-block',
                borderRadius: '50%', animation: `pulse 1s infinite ${i * 0.2}s`
              }} />
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

function StatCard({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ padding: '20px 24px', borderRight: '1px solid var(--border)' }}>
      <div className="eyebrow" style={{ margin: '0 0 8px', whiteSpace: 'nowrap' }}>{label}</div>
      <div className="mono-data" style={{ color: 'var(--cyan)', fontSize: 28, fontWeight: 700 }}>{value}</div>
    </div>
  )
}

const FEATURES = [
  { tag: '01', title: 'Natural language to structured intent', desc: 'Say what you want. The planner turns it into a payment, request, or proposal. Authority stays on-chain.' },
  { tag: '02', title: 'Payment requests with shareable links', desc: 'Create a request, share the link, and settle only after the payer authorizes through AgentVault.' },
  { tag: '03', title: 'On-chain policy in AgentVault', desc: 'Per-tx caps, daily limits, velocity, whitelist, and pause. The AI cannot override the contract.' },
  { tag: '04', title: 'Decision provenance', desc: 'Every AI-derived action commits a hash to DecisionLog before execution. Anyone can verify the record was not rewritten.' },
  { tag: '05', title: 'Modular execution adapters', desc: 'Propose swaps, cross-network moves, or DeFi actions. Execution still requires prior vault authorization.' },
  { tag: '06', title: 'External agent interface', desc: 'Other agents can submit structured intents. They receive proposals or requests. They never hold spend keys.' },
]

export default function Landing({ onLaunch }: { onLaunch: () => void }) {
  const [stats, setStats] = useState({ users: 0, transactions: 0, volume: '0.00', schedules: 0 })

  useEffect(() => {
    fetch('https://agentpay-c4o7.onrender.com/api/stats')
      .then(r => r.json())
      .then(data => setStats(data))
      .catch(() => {})
  }, [])

  const handleStart = () => {
    onLaunch()
  }

  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg)', color: 'var(--text)' }}>

      <nav style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '16px 24px',
        borderBottom: '1px solid var(--border)',
        position: 'sticky',
        top: 0,
        background: 'var(--bg)',
        zIndex: 100,
      }}>
        <span style={{ fontFamily: 'var(--font-head)', fontWeight: 600, fontStyle: 'italic', fontSize: 17, letterSpacing: 0.3 }}>AgentPay</span>
        <div style={{ display: 'flex', gap: 16, alignItems: 'center' }}>
          <a href="https://github.com/Godwin-web3/AgentPay" target="_blank" rel="noreferrer"
            style={{ color: 'var(--muted)', fontSize: 11, textDecoration: 'none', letterSpacing: 1, fontFamily: 'var(--font-mono)' }}>GITHUB</a>
          <a href="https://github.com/Godwin-web3/AgentPay/blob/main/TECHNICAL_ARCHITECTURE.md" target="_blank" rel="noreferrer"
            style={{ color: 'var(--muted)', fontSize: 11, textDecoration: 'none', letterSpacing: 1, fontFamily: 'var(--font-mono)' }}>ARCHITECTURE</a>
          <button onClick={handleStart} style={{
            padding: '7px 18px',
            background: 'transparent',
            border: '1px solid var(--cyan)',
            color: 'var(--cyan)',
            fontSize: 10,
            letterSpacing: 2,
            cursor: 'pointer',
            fontFamily: 'var(--font-mono)',
            borderRadius: 4,
          }}>GET STARTED</button>
        </div>
      </nav>

      <div style={{ padding: '72px 24px 40px', maxWidth: 720, width: '100%', margin: '0 auto' }} className="reveal">
        <p className="eyebrow">AI-native crypto on Arc</p>
        <h1 style={{ fontFamily: 'var(--font-head)', fontWeight: 600, fontSize: 'clamp(32px, 5vw, 46px)', lineHeight: 1.08, letterSpacing: '-0.01em', margin: '0 0 22px', textWrap: 'balance' as any }}>
          Express the outcome. <em style={{ fontStyle: 'italic', color: 'var(--cyan)' }}>AgentVault enforces the rules.</em>
        </h1>
        <p style={{ color: 'var(--muted)', fontSize: 15, lineHeight: 1.75, margin: '0 0 32px', fontFamily: 'var(--font-body)', maxWidth: '52ch' }}>
          AgentPay turns natural language into structured financial actions across EVM networks. AI proposes. Deterministic policy and execution systems decide what can happen and verify the result.
        </p>
        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
          <button onClick={handleStart} style={{
            padding: '13px 28px',
            background: 'var(--cyan)',
            border: 'none',
            color: '#17140A',
            fontSize: 13,
            fontWeight: 700,
            cursor: 'pointer',
            letterSpacing: 1,
            fontFamily: 'var(--font-mono)',
            borderRadius: 5,
          }}>
            START WITH GOOGLE
          </button>
          <a href="https://github.com/Godwin-web3/AgentPay" target="_blank" rel="noreferrer" style={{
            padding: '13px 28px',
            background: 'transparent',
            border: '1px solid var(--border)',
            color: 'var(--muted)',
            fontSize: 13,
            cursor: 'pointer',
            letterSpacing: 1,
            fontFamily: 'var(--font-mono)',
            textDecoration: 'none',
            display: 'inline-block',
            borderRadius: 5,
          }}>
            VIEW CODE
          </a>
        </div>
      </div>

      <div style={{ padding: '0 24px 60px', maxWidth: 720, width: '100%', margin: '0 auto' }}>
        <DemoTerminal />
        <p style={{ color: 'var(--muted)', fontSize: 11, marginTop: 10, textAlign: 'center', fontFamily: 'var(--font-mono)' }}>
          Requests are created without moving funds. Settlement still requires AgentVault authorization. Caps are enforced on-chain.
        </p>
      </div>

      <div style={{ borderTop: '1px solid var(--border)', borderBottom: '1px solid var(--border)' }}>
        <div style={{ display: 'grid', gridTemplateColumns: window.innerWidth < 500 ? 'repeat(2, minmax(0, 1fr))' : 'repeat(4, minmax(0, 1fr))', maxWidth: 720, width: '100%', margin: '0 auto' }}>
          <StatCard label="USERS" value={String(stats.users)} />
          <StatCard label="TRANSACTIONS" value={String(stats.transactions)} />
          <StatCard label="USDC VOLUME" value={'$' + stats.volume} />
          <StatCard label="ACTIVE SCHEDULES" value={String(stats.schedules)} />
        </div>
      </div>

      <div style={{ borderBottom: '1px solid var(--border)', position: 'relative', overflow: 'hidden' }}>
        <div style={{
          maxWidth: 960, width: '100%', margin: '0 auto', padding: '76px 24px',
          display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 40, alignItems: 'center',
        }} className="pools-pitch-grid">
          <div>
            <p className="eyebrow">Policy and provenance</p>
            <h2 style={{ fontFamily: 'var(--font-head)', fontWeight: 600, fontSize: 'clamp(28px, 4vw, 40px)', lineHeight: 1.06, margin: '0 0 20px', textWrap: 'balance' as any }}>
              AI proposes.<br /><em style={{ fontStyle: 'italic', color: 'var(--cyan)' }}>The vault decides.</em>
            </h2>
            <p style={{ color: 'var(--muted)', fontSize: 14.5, lineHeight: 1.7, margin: '0 0 20px', fontFamily: 'var(--font-body)', maxWidth: '48ch' }}>
              Every payment path routes through AgentVault. Caps, velocity, and whitelist are enforced on-chain. DecisionLog commits the decision hash before execution so the record cannot be rewritten after the fact.
            </p>
            <button onClick={handleStart} style={{
              padding: '11px 22px', background: 'transparent', border: '1px solid var(--cyan)', color: 'var(--cyan)',
              fontSize: 12, letterSpacing: 1, cursor: 'pointer', fontFamily: 'var(--font-mono)', borderRadius: 5,
            }}>
              OPEN THE APP →
            </button>
          </div>
          <div style={{ aspectRatio: '1 / 1', width: '100%', maxWidth: 340, margin: '0 auto' }}>
            <PoolsAmbientCanvas nodeCount={5} />
          </div>
        </div>
      </div>

      <div style={{ padding: '64px 24px', maxWidth: 720, width: '100%', margin: '0 auto' }}>
        <p className="eyebrow">Capabilities</p>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 1, background: 'var(--border)', marginTop: 20 }}>
          {FEATURES.map((f, i) => (
            <div key={i} style={{ background: 'var(--bg)', padding: '26px 20px', display: 'flex', gap: 18 }}>
              <span className="mono-data" style={{ color: 'var(--cyan)', fontSize: 10, letterSpacing: 2, flexShrink: 0, paddingTop: 4 }}>{f.tag}</span>
              <div>
                <div style={{ fontFamily: 'var(--font-head)', fontWeight: 600, fontSize: 17, marginBottom: 8 }}>{f.title}</div>
                <div style={{ color: 'var(--muted)', fontSize: 13.5, lineHeight: 1.7, fontFamily: 'var(--font-body)' }}>{f.desc}</div>
              </div>
            </div>
          ))}
        </div>
      </div>

      <div style={{ borderTop: '1px solid var(--border)', padding: '64px 24px', textAlign: 'center' }}>
        <h2 style={{ fontFamily: 'var(--font-head)', fontWeight: 600, fontSize: 26, marginBottom: 12 }}>Ready to use it?</h2>
        <p style={{ color: 'var(--muted)', fontSize: 13.5, marginBottom: 32, fontFamily: 'var(--font-body)' }}>
          Sign in with Google. Create a payment request or send under your policy. Settlement stays inside AgentVault.
        </p>
        <button onClick={handleStart} style={{
          padding: '14px 36px',
          background: 'var(--cyan)',
          border: 'none',
          color: '#17140A',
          fontSize: 14,
          fontWeight: 700,
          cursor: 'pointer',
          letterSpacing: 1,
          fontFamily: 'var(--font-mono)',
          borderRadius: 5,
        }}>
          START WITH GOOGLE
        </button>
      </div>

      <div style={{
        borderTop: '1px solid var(--border)',
        padding: '20px 24px',
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        flexWrap: 'wrap',
        gap: 8,
      }}>
        <span style={{ fontFamily: 'var(--font-head)', fontStyle: 'italic', fontWeight: 600, fontSize: 13 }}>AgentPay</span>
        <div style={{ display: 'flex', gap: 20 }}>
          <a href="https://github.com/Godwin-web3/AgentPay" target="_blank" rel="noreferrer"
            style={{ color: 'var(--muted)', fontSize: 10, textDecoration: 'none', letterSpacing: 1, fontFamily: 'var(--font-mono)' }}>GITHUB</a>
          <a href="https://github.com/Godwin-web3/AgentPay/blob/main/TECHNICAL_ARCHITECTURE.md" target="_blank" rel="noreferrer"
            style={{ color: 'var(--muted)', fontSize: 10, textDecoration: 'none', letterSpacing: 1, fontFamily: 'var(--font-mono)' }}>ARCHITECTURE</a>
          <a href="https://testnet.arcscan.app/address/0x24DD07639faA28c597c1Fb6a32367B1cc933DF60" target="_blank" rel="noreferrer"
            style={{ color: 'var(--muted)', fontSize: 10, textDecoration: 'none', letterSpacing: 1, fontFamily: 'var(--font-mono)' }}>CONTRACT</a>
        </div>
      </div>

      <style>{`
        @media (max-width: 720px) {
          .pools-pitch-grid { grid-template-columns: 1fr !important; }
        }
      `}</style>

    </div>
  )
}

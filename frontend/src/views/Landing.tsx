import { useState, useEffect } from 'react'
import PoolsAmbientCanvas from '../components/PoolsAmbientCanvas'

const DEMO_LINES = [
  { role: 'user', text: 'send 5 USDC to @sara for design work', delay: 300 },
  { role: 'agent', text: 'Checking policy...', delay: 900 },
  { role: 'agent', text: 'Per-tx cap: $10. Recipient whitelisted.', delay: 1400 },
  { role: 'agent', text: 'Signing off-chain via EIP-712...', delay: 1900 },
  { role: 'agent', text: '[OK] 0x4a2f...c91e confirmed. Gas sponsored.', delay: 2500 },
  { role: 'user', text: 'send 500 USDC to @unknown', delay: 3500 },
  { role: 'agent', text: 'Checking policy...', delay: 4100 },
  { role: 'agent', text: '[BLOCKED] Exceeds per-tx cap of $10. Vault reverted.', delay: 4700, blocked: true },
]

function DemoTerminal() {
  const [visible, setVisible] = useState(0)

  useEffect(() => {
    const timers = DEMO_LINES.map((line, i) =>
      setTimeout(() => setVisible(i + 1), line.delay)
    )
    const reset = setTimeout(() => setVisible(0), 7000)
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
        <span style={{ color: 'var(--cyan)', fontSize: 10, letterSpacing: 2 }}>AGENTPAY TERMINAL</span>
        <span style={{ color: 'var(--muted)', fontSize: 9, opacity: 0.6 }}>ARC TESTNET</span>
      </div>
      <div style={{ padding: '14px 12px', display: 'flex', flexDirection: 'column', gap: 8, minHeight: 200 }}>
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
  { tag: '01', title: 'No wallet required to start', desc: 'Sign in with Google. A Circle-issued wallet is created automatically. No seed phrases, no gas, no setup.' },
  { tag: '02', title: 'Send to @tags, not addresses', desc: 'Claim your @tag and receive USDC from anyone. No address copying. Works with any wallet externally.' },
  { tag: '03', title: 'Gasless transactions', desc: 'Circle sponsors every transaction on Arc testnet. Your users never touch native tokens.' },
  { tag: '04', title: 'On-chain policy enforcement', desc: 'Per-tx caps, daily limits, whitelist, active hours, circuit breaker. All enforced by the vault contract before any payment fires.' },
  { tag: '05', title: 'Scheduled + conditional payments', desc: 'Recurring on-chain payments. Trigger on weather, GitHub PRs, price feeds, or any HTTP condition.' },
  { tag: '06', title: 'Agent-to-agent payments (x402)', desc: 'Your agent pays other agents for data and compute over HTTP 402. Fully autonomous, policy-gated.' },
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

      {/* Nav */}
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

      {/* Hero */}
      <div style={{ padding: '72px 24px 40px', maxWidth: 720, width: '100%', margin: '0 auto' }} className="reveal">
        <p className="eyebrow">Built on Arc — Circle's stablecoin-native L1</p>
        <h1 style={{ fontFamily: 'var(--font-head)', fontWeight: 600, fontSize: 'clamp(32px, 5vw, 46px)', lineHeight: 1.08, letterSpacing: '-0.01em', margin: '0 0 22px', textWrap: 'balance' as any }}>
          Tell your agent to pay. <em style={{ fontStyle: 'italic', color: 'var(--cyan)' }}>Your rules stop it</em> from going too far.
        </h1>
        <p style={{ color: 'var(--muted)', fontSize: 15, lineHeight: 1.75, margin: '0 0 32px', fontFamily: 'var(--font-body)', maxWidth: '52ch' }}>
          AgentPay gives an AI agent access to your USDC. A smart contract enforces your spending rules — per-transaction caps, daily limits, whitelists, active hours. The AI physically cannot exceed what you pre-authorized on-chain.
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

      {/* Demo terminal */}
      <div style={{ padding: '0 24px 60px', maxWidth: 720, width: '100%', margin: '0 auto' }}>
        <DemoTerminal />
        <p style={{ color: 'var(--muted)', fontSize: 11, marginTop: 10, textAlign: 'center', fontFamily: 'var(--font-mono)' }}>
          The second payment is blocked by the vault. The AI cannot override it.
        </p>
      </div>

      {/* Live stats */}
      <div style={{ borderTop: '1px solid var(--border)', borderBottom: '1px solid var(--border)' }}>
        <div style={{ display: 'grid', gridTemplateColumns: window.innerWidth < 500 ? 'repeat(2, minmax(0, 1fr))' : 'repeat(4, minmax(0, 1fr))', maxWidth: 720, width: '100%', margin: '0 auto' }}>
          <StatCard label="USERS" value={String(stats.users)} />
          <StatCard label="TRANSACTIONS" value={String(stats.transactions)} />
          <StatCard label="USDC VOLUME" value={'$' + stats.volume} />
          <StatCard label="ACTIVE SCHEDULES" value={String(stats.schedules)} />
        </div>
      </div>

      {/* Pools — flagship feature gets its own hero moment */}
      <div style={{ borderBottom: '1px solid var(--border)', position: 'relative', overflow: 'hidden' }}>
        <div style={{
          maxWidth: 960, width: '100%', margin: '0 auto', padding: '76px 24px',
          display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 40, alignItems: 'center',
        }} className="pools-pitch-grid">
          <div>
            <p className="eyebrow">AgentPay · Pools</p>
            <h2 style={{ fontFamily: 'var(--font-head)', fontWeight: 600, fontSize: 'clamp(28px, 4vw, 40px)', lineHeight: 1.06, margin: '0 0 20px', textWrap: 'balance' as any }}>
              Nothing leaves<br />without <em style={{ fontStyle: 'italic', color: 'var(--cyan)' }}>a witness.</em>
            </h2>
            <p style={{ color: 'var(--muted)', fontSize: 14.5, lineHeight: 1.7, margin: '0 0 20px', fontFamily: 'var(--font-body)', maxWidth: '48ch' }}>
              Share money with roommates, a small team, a trip fund — with rules everyone agreed to. Small spends clear instantly; anything above your threshold is proposed to the whole group and <b style={{ color: 'var(--text)' }}>sealed only if nobody objects.</b> One tap from anyone stops it, permanently, on-chain.
            </p>
            <button onClick={handleStart} style={{
              padding: '11px 22px', background: 'transparent', border: '1px solid var(--cyan)', color: 'var(--cyan)',
              fontSize: 12, letterSpacing: 1, cursor: 'pointer', fontFamily: 'var(--font-mono)', borderRadius: 5,
            }}>
              TRY POOLS →
            </button>
          </div>
          <div style={{ aspectRatio: '1 / 1', width: '100%', maxWidth: 340, margin: '0 auto' }}>
            <PoolsAmbientCanvas nodeCount={5} />
          </div>
        </div>
      </div>

      {/* Features */}
      <div style={{ padding: '64px 24px', maxWidth: 720, width: '100%', margin: '0 auto' }}>
        <p className="eyebrow">What you get</p>
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

      {/* CTA */}
      <div style={{ borderTop: '1px solid var(--border)', padding: '64px 24px', textAlign: 'center' }}>
        <h2 style={{ fontFamily: 'var(--font-head)', fontWeight: 600, fontSize: 26, marginBottom: 12 }}>Ready to try it?</h2>
        <p style={{ color: 'var(--muted)', fontSize: 13.5, marginBottom: 32, fontFamily: 'var(--font-body)' }}>
          Sign in with Google. Pick your @tag. Your wallet is ready in seconds.
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

      {/* Footer */}
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

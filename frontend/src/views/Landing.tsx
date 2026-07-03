import { useState, useEffect } from 'react'

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
      background: '#0B0D10',
      border: '1px solid #222',
      fontFamily: 'var(--font-mono)',
      fontSize: 12,
      width: '100%',
      overflow: 'hidden',
    }}>
      <div style={{
        padding: '8px 14px',
        borderBottom: '1px solid #222',
        background: '#111',
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center'
      }}>
        <span style={{ color: 'var(--seal)', fontSize: 10, letterSpacing: 2 }}>AGENTPAY TERMINAL</span>
        <span style={{ color: '#333', fontSize: 9 }}>ARC TESTNET</span>
      </div>
      <div style={{ padding: '14px 12px', display: 'flex', flexDirection: 'column', gap: 8, minHeight: 200 }}>
        {DEMO_LINES.slice(0, visible).map((line, i) => (
          <div key={i} style={{ display: 'flex', justifyContent: line.role === 'user' ? 'flex-end' : 'flex-start' }}>
            <div style={{
              maxWidth: '85%',
              padding: '7px 11px',
              background: line.role === 'user' ? '#D9A44110' : (line.blocked ? '#ff444410' : '#141414'),
              border: `1px solid ${line.role === 'user' ? '#D9A44130' : (line.blocked ? '#ff444430' : '#222')}`,
              color: line.blocked ? '#ff6666' : (line.role === 'user' ? 'var(--seal)' : '#ccc'),
              lineHeight: 1.5,
            }}>
              {line.text}
            </div>
          </div>
        ))}
        {visible > 0 && visible < DEMO_LINES.length && (
          <div style={{ display: 'flex', gap: 4, padding: '4px 0' }}>
            {[0,1,2].map(i => (
              <span key={i} style={{
                width: 5, height: 5, background: 'var(--seal)', display: 'inline-block',
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
    <div style={{ padding: '20px 24px', borderRight: '1px solid #1a1a1a' }}>
      <div style={{ color: '#444', fontSize: 9, letterSpacing: 1, fontFamily: 'var(--font-mono)', marginBottom: 8, whiteSpace: 'nowrap' }}>{label}</div>
      <div style={{ color: 'var(--seal)', fontSize: 28, fontWeight: 700, fontFamily: 'var(--font-mono)' }}>{value}</div>
    </div>
  )
}

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
    <div style={{ minHeight: '100vh', background: '#0B0D10', color: 'var(--text)', fontFamily: 'var(--font-mono)' }}>

      {/* Nav */}
      <nav style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '16px 24px',
        borderBottom: '1px solid #1a1a1a',
        position: 'sticky',
        top: 0,
        background: '#0B0D10',
        zIndex: 100,
      }}>
        <span style={{ fontSize: 14, fontWeight: 700, letterSpacing: 3 }}>AGENTPAY</span>
        <div style={{ display: 'flex', gap: 16, alignItems: 'center' }}>
          <a href="https://github.com/Godwin-web3/AgentPay" target="_blank" rel="noreferrer"
            style={{ color: '#444', fontSize: 11, textDecoration: 'none', letterSpacing: 1 }}>GITHUB</a>
          <button onClick={handleStart} style={{
            padding: '7px 18px',
            background: 'transparent',
            border: '1px solid var(--seal)',
            color: 'var(--seal)',
            fontSize: 10,
            letterSpacing: 2,
            cursor: 'pointer',
          }}>GET STARTED</button>
        </div>
      </nav>

      {/* Hero */}
      <div style={{ padding: '60px 24px 40px', maxWidth: 720, width: '100%', margin: '0 auto' }}>
        <div style={{ fontSize: 9, letterSpacing: 4, color: 'var(--seal)', marginBottom: 20 }}>
          BUILT FOR ARC PROGRAMMABLE MONEY HACKATHON
        </div>
        <h1 style={{ fontSize: 32, fontWeight: 800, lineHeight: 1.1, margin: '0 0 20px', letterSpacing: -0.5 }}>
          Tell your agent to pay.<br />
          Your rules stop it<br />
          from going too far.
        </h1>
        <p style={{ color: '#666', fontSize: 14, lineHeight: 1.8, margin: '0 0 32px', fontFamily: 'var(--font-body)' }}>
          AgentPay gives an AI agent access to your USDC. A smart contract enforces your spending rules — per-transaction caps, daily limits, whitelists, active hours. The AI physically cannot exceed what you pre-authorized on-chain.
        </p>
        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
          <button onClick={handleStart} style={{
            padding: '13px 28px',
            background: 'var(--seal)',
            border: 'none',
            color: '#0B0D10',
            fontSize: 13,
            fontWeight: 700,
            cursor: 'pointer',
            letterSpacing: 1,
            fontFamily: 'var(--font-mono)',
          }}>
            START WITH GOOGLE
          </button>
          <a href="https://github.com/Godwin-web3/AgentPay" target="_blank" rel="noreferrer" style={{
            padding: '13px 28px',
            background: 'transparent',
            border: '1px solid #333',
            color: '#888',
            fontSize: 13,
            cursor: 'pointer',
            letterSpacing: 1,
            fontFamily: 'var(--font-mono)',
            textDecoration: 'none',
            display: 'inline-block',
          }}>
            VIEW CODE
          </a>
        </div>
      </div>

      {/* Demo terminal */}
      <div style={{ padding: '0 24px 60px', maxWidth: 720, width: '100%', margin: '0 auto' }}>
        <DemoTerminal />
        <p style={{ color: '#333', fontSize: 11, marginTop: 10, textAlign: 'center' }}>
          The second payment is blocked by the vault. The AI cannot override it.
        </p>
      </div>

      {/* Live stats */}
      <div style={{ borderTop: '1px solid #1a1a1a', borderBottom: '1px solid #1a1a1a' }}>
        <div style={{ display: 'grid', gridTemplateColumns: window.innerWidth < 500 ? 'repeat(2, minmax(0, 1fr))' : 'repeat(4, minmax(0, 1fr))', maxWidth: 720, width: '100%', margin: '0 auto' }}>
          <StatCard label="USERS" value={String(stats.users)} />
          <StatCard label="TRANSACTIONS" value={String(stats.transactions)} />
          <StatCard label="USDC VOLUME" value={'$' + stats.volume} />
          <StatCard label="ACTIVE SCHEDULES" value={String(stats.schedules)} />
        </div>
      </div>

      {/* Features */}
      <div style={{ padding: '60px 24px', maxWidth: 720, width: '100%', margin: '0 auto' }}>
        <div style={{ fontSize: 9, letterSpacing: 4, color: '#444', marginBottom: 32 }}>WHAT YOU GET</div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 1, background: '#1a1a1a' }}>
          {[
            { tag: '01', title: 'NO WALLET REQUIRED TO START', desc: 'Sign in with Google. A Circle-issued wallet is created automatically. No seed phrases, no gas, no setup.' },
            { tag: '02', title: 'SEND TO @TAGS NOT ADDRESSES', desc: 'Claim your @tag and receive USDC from anyone. No address copying. Works with any wallet externally.' },
            { tag: '03', title: 'GASLESS TRANSACTIONS', desc: 'Circle sponsors every transaction on Arc testnet. Your users never touch native tokens.' },
            { tag: '04', title: 'ON-CHAIN POLICY ENFORCEMENT', desc: 'Per-tx caps, daily limits, whitelist, active hours, circuit breaker. All enforced by the vault contract before any payment fires.' },
            { tag: '05', title: 'SCHEDULED + CONDITIONAL PAYMENTS', desc: 'Recurring on-chain payments. Trigger on weather, GitHub PRs, price feeds, or any HTTP condition.' },
            { tag: '06', title: 'AGENT-TO-AGENT PAYMENTS (x402)', desc: 'Your agent pays other agents for data and compute over HTTP 402. Fully autonomous, policy-gated.' },
          ].map((f, i) => (
            <div key={i} style={{ background: '#0B0D10', padding: '24px 20px', display: 'flex', gap: 16 }}>
              <span style={{ color: 'var(--seal)', fontSize: 9, letterSpacing: 2, flexShrink: 0, paddingTop: 2 }}>{f.tag}</span>
              <div>
                <div style={{ fontSize: 11, letterSpacing: 1, marginBottom: 8 }}>{f.title}</div>
                <div style={{ color: '#555', fontSize: 13, lineHeight: 1.7, fontFamily: 'var(--font-body)' }}>{f.desc}</div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* CTA */}
      <div style={{ borderTop: '1px solid #1a1a1a', padding: '60px 24px', textAlign: 'center' }}>
        <h2 style={{ fontSize: 24, fontWeight: 700, marginBottom: 12 }}>Ready to try it?</h2>
        <p style={{ color: '#555', fontSize: 13, marginBottom: 32, fontFamily: 'var(--font-body)' }}>
          Sign in with Google. Pick your @tag. Your wallet is ready in seconds.
        </p>
        <button onClick={handleStart} style={{
          padding: '14px 36px',
          background: 'var(--seal)',
          border: 'none',
          color: '#0B0D10',
          fontSize: 14,
          fontWeight: 700,
          cursor: 'pointer',
          letterSpacing: 1,
          fontFamily: 'var(--font-mono)',
        }}>
          START WITH GOOGLE
        </button>
      </div>

      {/* Footer */}
      <div style={{
        borderTop: '1px solid #1a1a1a',
        padding: '20px 24px',
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        flexWrap: 'wrap',
        gap: 8,
      }}>
        <span style={{ fontSize: 11, letterSpacing: 3 }}>AGENTPAY</span>
        <div style={{ display: 'flex', gap: 20 }}>
          <a href="https://github.com/Godwin-web3/AgentPay" target="_blank" rel="noreferrer"
            style={{ color: '#444', fontSize: 10, textDecoration: 'none', letterSpacing: 1 }}>GITHUB</a>
          <a href="https://testnet.arcscan.app/address/0x24DD07639faA28c597c1Fb6a32367B1cc933DF60" target="_blank" rel="noreferrer"
            style={{ color: '#444', fontSize: 10, textDecoration: 'none', letterSpacing: 1 }}>CONTRACT</a>
        </div>
      </div>

    </div>
  )
}

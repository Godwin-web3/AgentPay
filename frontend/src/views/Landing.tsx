import { useState, useEffect } from 'react'

const DEMO_LINES = [
  { role: 'user', text: 'pay 0.5 STT to 0xABC...def for quest reward', delay: 500 },
  { role: 'assistant', text: 'Checking policy...', delay: 1200 },
  { role: 'assistant', text: 'Spending limit OK. Recipient whitelisted.', delay: 2000 },
  { role: 'assistant', text: 'Executing on Somnia testnet...', delay: 2800 },
  { role: 'assistant', text: '[OK] Block #82910 — TX: 0x92f...a12', delay: 3800 },
]

const QUICK_BTNS = ['SEND', 'SWAP', 'SCHEDULE', 'BALANCE', 'POLICY']

function DemoTerminal() {
  const [visible, setVisible] = useState(0)

  useEffect(() => {
    DEMO_LINES.forEach((line, i) => {
      setTimeout(() => setVisible(i + 1), line.delay)
    })
  }, [])

  return (
    <div style={{
      display: 'flex',
      flexDirection: 'column',
      height: 420,
      background: '#0A0A0A',
      border: '1px solid #262626',
      fontFamily: 'var(--font-mono)',
      fontSize: 13,
      width: '100%',
      overflow: 'hidden',
    }}>
      {/* Terminal header */}
      <div style={{
        padding: '10px 16px',
        borderBottom: '1px solid #262626',
        background: '#141414',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        flexShrink: 0,
      }}>
        <span style={{ fontSize: 10, letterSpacing: 2, color: '#4fdbc8' }}>AGENTPAY TERMINAL</span>
        <span style={{ fontSize: 9, color: '#444', letterSpacing: 1 }}>SOMNIA TESTNET</span>
      </div>

      {/* Messages */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '16px 12px', display: 'flex', flexDirection: 'column', gap: 10 }}>
        {DEMO_LINES.slice(0, visible).map((line, i) => (
          <div key={i} style={{
            display: 'flex',
            justifyContent: line.role === 'user' ? 'flex-end' : 'flex-start',
            animation: 'slideIn 0.2s ease forwards',
          }}>
            <div style={{
              maxWidth: '78%',
              padding: '8px 12px',
              background: line.role === 'user' ? '#4fdbc815' : '#141414',
              border: line.role === 'user' ? '1px solid #4fdbc840' : '1px solid #262626',
              color: line.role === 'user' ? '#4fdbc8' : '#e8eeff',
              fontSize: 12,
              lineHeight: 1.5,
            }}>
              {line.text}
            </div>
          </div>
        ))}
        {visible > 0 && visible < DEMO_LINES.length && (
          <div style={{ display: 'flex', justifyContent: 'flex-start' }}>
            <div style={{ padding: '8px 12px', border: '1px solid #262626', background: '#141414', display: 'flex', gap: 4, alignItems: 'center' }}>
              <span style={{ width: 6, height: 6, background: '#4fdbc8', display: 'inline-block', animation: 'pulse 1s infinite' }} />
              <span style={{ width: 6, height: 6, background: '#4fdbc8', display: 'inline-block', animation: 'pulse 1s infinite 0.2s' }} />
              <span style={{ width: 6, height: 6, background: '#4fdbc8', display: 'inline-block', animation: 'pulse 1s infinite 0.4s' }} />
            </div>
          </div>
        )}
      </div>

      {/* Quick actions */}
      <div style={{
        display: 'flex',
        gap: 6,
        padding: '8px 12px',
        borderTop: '1px solid #262626',
        overflowX: 'auto',
        flexShrink: 0,
        scrollbarWidth: 'none',
      }}>
        {QUICK_BTNS.map(btn => (
          <div key={btn} style={{
            flexShrink: 0,
            padding: '4px 10px',
            border: '1px solid #262626',
            color: '#555',
            fontSize: 10,
            letterSpacing: 1.5,
            whiteSpace: 'nowrap',
          }}>
            {btn}
          </div>
        ))}
      </div>

      {/* Input bar */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        padding: '10px 12px',
        borderTop: '1px solid #262626',
        background: '#141414',
        flexShrink: 0,
      }}>
        <div style={{
          flex: 1,
          padding: '8px 12px',
          border: '1px solid #262626',
          background: '#0A0A0A',
          color: '#333',
          fontSize: 12,
        }}>
          Type a message...
        </div>
        <div style={{
          padding: '8px 14px',
          border: '1px solid #4fdbc840',
          color: '#4fdbc8',
          fontSize: 12,
        }}>
          &#x27A4;
        </div>
      </div>
    </div>
  )
}

export default function Landing({ onLaunch }: { onLaunch: () => void }) {
  const [isMobile, setIsMobile] = useState(window.innerWidth <= 768)

  useEffect(() => {
    const handleResize = () => setIsMobile(window.innerWidth <= 768)
    window.addEventListener('resize', handleResize)
    return () => window.removeEventListener('resize', handleResize)
  }, [])

  return (
    <div style={{ minHeight: '100vh', background: '#0A0A0A', overflowY: 'auto', width: '100%' }}>

      {/* Nav */}
      <nav style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: isMobile ? '14px 20px' : '16px 40px',
        borderBottom: '1px solid #262626',
        background: '#0A0A0A',
        position: 'sticky',
        top: 0,
        zIndex: 100,
      }}>
        <div style={{ fontFamily: 'var(--font-mono)', fontSize: 14, fontWeight: 700, letterSpacing: 3, color: '#fff' }}>
          AGENTPAY
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
          <div style={{
            display: 'flex', alignItems: 'center', gap: 6,
            padding: '4px 10px',
            border: '1px solid #4fdbc840',
            fontFamily: 'var(--font-mono)', fontSize: 9, letterSpacing: 2, color: '#4fdbc8',
          }}>
            <span style={{ width: 5, height: 5, background: '#4fdbc8', borderRadius: '50%', display: 'inline-block', animation: 'pulse 2s infinite' }} />
            LIVE
          </div>
          <button onClick={onLaunch} style={{
            padding: '6px 16px',
            background: 'transparent',
            border: '1px solid #4fdbc8',
            color: '#4fdbc8',
            fontFamily: 'var(--font-mono)',
            fontSize: 10,
            letterSpacing: 2,
            cursor: 'pointer',
          }}>
            LAUNCH
          </button>
        </div>
      </nav>

      {/* Hero */}
      <div style={{
        display: 'flex',
        flexDirection: isMobile ? 'column' : 'row',
        gap: isMobile ? 40 : 60,
        padding: isMobile ? '40px 20px' : '60px 40px',
        maxWidth: 1200,
        margin: '0 auto',
        alignItems: 'center',
      }}>
        {/* Left — headline + spec */}
        <div style={{ flex: 1 }}>
          <h1 style={{
            fontFamily: 'var(--font-head)',
            fontSize: isMobile ? 38 : 48,
            fontWeight: 800,
            lineHeight: 1.08,
            letterSpacing: -0.5,
            color: '#fff',
            margin: 0,
            marginBottom: 32,
          }}>
            YOUR AGENT.<br />
            YOUR RULES.<br />
            YOUR CHAIN.
          </h1>

          <div style={{
            borderLeft: '2px solid #4fdbc8',
            paddingLeft: 20,
            display: 'flex',
            flexDirection: 'column',
            gap: 12,
            marginBottom: 40,
          }}>
            <div style={{ fontFamily: 'var(--font-mono)', fontSize: 11, letterSpacing: 2, color: '#4fdbc8', marginBottom: 4 }}>AGENTPAY</div>
            {[
              '— Policy enforced',
              '— Autonomous execution',
              '— On-chain, on Somnia',
            ].map((item, i) => (
              <div key={i} style={{ fontFamily: 'var(--font-mono)', fontSize: 13, color: '#aaa', letterSpacing: 0.5 }}>
                {item}
              </div>
            ))}
          </div>

          <button onClick={onLaunch} style={{
            padding: '12px 28px',
            background: 'transparent',
            border: '1px solid #4fdbc8',
            color: '#4fdbc8',
            fontFamily: 'var(--font-mono)',
            fontSize: 11,
            letterSpacing: 3,
            cursor: 'pointer',
            display: isMobile ? 'none' : 'block',
          }}>
            CONNECT + LAUNCH
          </button>
        </div>

        {/* Right — demo terminal */}
        <div style={{ flex: 1, width: '100%' }}>
          <DemoTerminal />
        </div>
      </div>

      {/* Mobile CTA */}
      {isMobile && (
        <div style={{ padding: '0 20px 40px' }}>
          <button onClick={onLaunch} style={{
            width: '100%',
            padding: '14px',
            background: 'transparent',
            border: '1px solid #4fdbc8',
            color: '#4fdbc8',
            fontFamily: 'var(--font-mono)',
            fontSize: 11,
            letterSpacing: 3,
            cursor: 'pointer',
          }}>
            CONNECT + LAUNCH
          </button>
        </div>
      )}

      {/* Stats bar */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: isMobile ? '1fr' : 'repeat(3, 1fr)',
        margin: isMobile ? '0 20px' : '0 40px',
        border: '1px solid #262626',
        background: '#141414',
      }}>
        {[
          { label: 'AGENTS REGISTERED', value: '1' },
          { label: 'TOTAL TRANSACTIONS', value: '12' },
          { label: 'STT VOLUME', value: '4.5' },
        ].map((stat, i) => (
          <div key={i} style={{
            padding: '20px 24px',
            borderRight: !isMobile && i < 2 ? '1px solid #262626' : 'none',
            borderBottom: isMobile && i < 2 ? '1px solid #262626' : 'none',
          }}>
            <div style={{ fontFamily: 'var(--font-mono)', fontSize: 9, letterSpacing: 3, color: '#555', marginBottom: 10 }}>
              {stat.label}
            </div>
            <div style={{ fontFamily: 'var(--font-head)', fontSize: 32, fontWeight: 900, color: '#4fdbc8' }}>
              {stat.value}
            </div>
          </div>
        ))}
      </div>

      {/* Features */}
      <div style={{ padding: isMobile ? '60px 20px' : '80px 40px', maxWidth: 1200, margin: '0 auto' }}>
        <div style={{ fontFamily: 'var(--font-mono)', fontSize: 9, letterSpacing: 4, color: '#555', marginBottom: 32 }}>
          CAPABILITIES
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : 'repeat(3, 1fr)', gap: 1, background: '#262626' }}>
          {[
            {
              tag: '01',
              title: 'NATURAL LANGUAGE PAYMENTS',
              desc: 'Say "send 0.5 STT to 0x..." — the agent handles signing, broadcasting, and confirmation on Somnia.',
            },
            {
              tag: '02',
              title: 'POLICY ENFORCEMENT',
              desc: 'Per-tx caps, daily limits, whitelists, active hours, circuit breakers — all enforced before any transaction fires.',
            },
            {
              tag: '03',
              title: 'ON-CHAIN AUDIT LOG',
              desc: 'Every action logged — executed, rejected, or failed — with Somnia Explorer links for full transparency.',
            },
          ].map((f, i) => (
            <div key={i} style={{ background: '#0A0A0A', padding: '28px 24px' }}>
              <div style={{ fontFamily: 'var(--font-mono)', fontSize: 9, color: '#4fdbc8', letterSpacing: 2, marginBottom: 16 }}>{f.tag}</div>
              <div style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: '#fff', letterSpacing: 1, marginBottom: 12 }}>{f.title}</div>
              <div style={{ fontFamily: 'var(--font-body)', fontSize: 13, color: '#555', lineHeight: 1.7 }}>{f.desc}</div>
            </div>
          ))}
        </div>
      </div>

      {/* Footer */}
      <div style={{
        borderTop: '1px solid #262626',
        padding: '20px 40px',
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
      }}>
        <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, letterSpacing: 3, color: '#fff' }}>AGENTPAY</span>
        <span style={{ fontFamily: 'var(--font-mono)', fontSize: 9, letterSpacing: 2, color: '#555' }}>BUILT FOR SOMNIA AGENTATHON 2026</span>
      </div>

    </div>
  )
}

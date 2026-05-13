import { useState, useEffect } from 'react'

const TERMINAL_LINES = [
  { role: 'User', text: 'pay 0.5 STT to 0xABC... for quest reward', delay: 0 },
  { role: 'Agent', text: 'Checking policy...', delay: 800 },
  { role: 'Agent', text: '✓ Spending limit OK', delay: 1400 },
  { role: 'Agent', text: '✓ Recipient whitelisted', delay: 1900 },
  { role: 'Agent', text: 'Executing transaction on Somnia...', delay: 2500 },
  { role: 'Success', text: 'Block #82910 | TX: 0x92f...a12', delay: 3400 },
]

function TerminalPreview() {
  const [visible, setVisible] = useState(0)

  useEffect(() => {
    TERMINAL_LINES.forEach((line, i) => {
      setTimeout(() => setVisible(i + 1), line.delay)
    })
  }, [])

  return (
    <div className="terminal-preview" style={{
      background: '#05071E',
      border: '1px solid #1a2456',
      borderRadius: 12,
      overflow: 'hidden',
      fontFamily: 'var(--font-mono)',
      fontSize: 13,
      boxShadow: '0 0 60px #4D9FFF18, 0 0 120px #4D9FFF08',
      position: 'relative',
      width: '100%'
    }}>
      {/* Terminal top bar */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        gap: 6,
        padding: '10px 16px',
        borderBottom: '1px solid #1a2456',
        background: '#080D2A'
      }}>
        <span style={{ width: 10, height: 10, borderRadius: '50%', background: '#FF5F57', display: 'inline-block' }} />
        <span style={{ width: 10, height: 10, borderRadius: '50%', background: '#FEBC2E', display: 'inline-block' }} />
        <span style={{ width: 10, height: 10, borderRadius: '50%', background: '#28C840', display: 'inline-block' }} />
        <span style={{ marginLeft: 8, color: '#4A5480', fontSize: 11, letterSpacing: 1 }}>agentpay-v4.0</span>
      </div>

      {/* Terminal body */}
      <div style={{ padding: '16px', minHeight: 220 }}>
        {TERMINAL_LINES.slice(0, visible).map((line, i) => (
          <div key={i} style={{
            marginBottom: 8,
            animation: 'slideIn 0.3s ease forwards',
            display: 'flex',
            gap: 10
          }}>
            <span style={{
              color: line.role === 'User' ? '#4D9FFF'
                : line.role === 'Success' ? '#00E5CC'
                : '#4A5480',
              minWidth: 56,
              flexShrink: 0
            }}>
              {line.role === 'Success' ? '✓' : line.role + ':'}
            </span>
            <span style={{
              color: line.role === 'Success' ? '#00E5CC' : '#E8EEFF',
              wordBreak: 'break-all'
            }}>
              {line.text}
            </span>
          </div>
        ))}
        {visible < TERMINAL_LINES.length && (
          <span style={{ color: '#4D9FFF', animation: 'pulse 1s infinite' }}>_</span>
        )}
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
    <div style={{
      minHeight: '100vh',
      background: 'var(--bg)',
      overflowY: 'auto',
      position: 'relative',
      width: '100%'
    }}>

      {/* Background effects */}
      <div style={{
        position: 'fixed',
        top: '-20%',
        right: '-10%',
        width: '50%',
        height: '70%',
        background: 'radial-gradient(ellipse, #4D9FFF08 0%, transparent 70%)',
        pointerEvents: 'none'
      }} />
      
      {/* Nav */}
      <nav style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: isMobile ? '15px 20px' : '20px 40px',
        borderBottom: '1px solid var(--border)',
        background: '#04061Acc',
        backdropFilter: 'blur(12px)',
        position: 'sticky',
        top: 0,
        zIndex: 100
      }}>
        <div style={{
          fontFamily: 'var(--font-head)',
          fontSize: isMobile ? 16 : 20,
          fontWeight: 900,
          letterSpacing: 2,
          background: 'linear-gradient(135deg, #4D9FFF, #00E5CC)',
          WebkitBackgroundClip: 'text',
          WebkitTextFillColor: 'transparent',
          backgroundClip: 'text'
        }}>
          AGENTPAY
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: isMobile ? 15 : 32 }}>
          {!isMobile && (
            <>
              <span style={{
                fontFamily: 'var(--font-mono)', fontSize: 11, letterSpacing: 2,
                color: 'var(--muted)', textTransform: 'uppercase', cursor: 'pointer'
              }} onClick={onLaunch}>
                Terminal
              </span>
              <span style={{
                fontFamily: 'var(--font-mono)', fontSize: 11, letterSpacing: 2,
                color: 'var(--muted)', textTransform: 'uppercase'
              }}>
                Docs
              </span>
            </>
          )}
          <button
            onClick={onLaunch}
            style={{
              padding: isMobile ? '8px 12px' : '8px 18px',
              background: 'linear-gradient(135deg, #4D9FFF, #00E5CC)',
              border: 'none',
              borderRadius: 6,
              fontFamily: 'var(--font-mono)',
              fontSize: 10,
              fontWeight: 700,
              letterSpacing: isMobile ? 1 : 2,
              color: '#04061A',
              cursor: 'pointer',
              textTransform: 'uppercase'
            }}
          >
            {isMobile ? 'Launch' : 'Launch App'}
          </button>
        </div>
      </nav>

      {/* Hero */}
      <div style={{
        display: 'flex',
        flexDirection: isMobile ? 'column' : 'row',
        gap: isMobile ? 40 : 60,
        padding: isMobile ? '40px 20px' : '80px 40px',
        maxWidth: 1200,
        margin: '0 auto',
        alignItems: 'center'
      }}>
        {/* Left */}
        <div style={{ width: '100%', textAlign: isMobile ? 'center' : 'left' }}>
          <div style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 8,
            padding: '6px 14px',
            border: '1px solid #4D9FFF44',
            borderRadius: 20,
            background: '#4D9FFF0A',
            fontFamily: 'var(--font-mono)',
            fontSize: 10,
            color: 'var(--blue)',
            letterSpacing: 1,
            marginBottom: 20
          }}>
            <span style={{
              width: 6, height: 6, borderRadius: '50%',
              background: '#00E5CC',
              display: 'inline-block',
              animation: 'pulse 2s infinite'
            }} />
            LIVE ON SOMNIA TESTNET
          </div>

          <h1 style={{
            fontFamily: 'var(--font-head)',
            fontSize: isMobile ? 36 : 52,
            fontWeight: 900,
            lineHeight: 1.1,
            letterSpacing: 1,
            marginBottom: 24,
            color: 'var(--text)'
          }}>
            The Payment<br />
            Protocol for{' '}
            <span style={{
              background: 'linear-gradient(135deg, #4D9FFF, #00E5CC)',
              WebkitBackgroundClip: 'text',
              WebkitTextFillColor: 'transparent',
              backgroundClip: 'text'
            }}>
              AI Agents.
            </span>
          </h1>

          <p style={{
            fontFamily: 'var(--font-body)',
            fontSize: 16,
            color: 'var(--muted)',
            lineHeight: 1.7,
            marginBottom: 40,
            maxWidth: isMobile ? 'none' : 440,
            marginLeft: isMobile ? 'auto' : 0,
            marginRight: isMobile ? 'auto' : 0
          }}>
            Enable autonomous, policy-driven STT transfers on Somnia
            using natural language. Give your agents the financial
            sovereignty they need with programmable guardrails.
          </p>

          <div style={{ display: 'flex', gap: 14, justifyContent: isMobile ? 'center' : 'flex-start' }}>
            <button
              onClick={onLaunch}
              style={{
                padding: '14px 24px',
                background: 'linear-gradient(135deg, #4D9FFF, #00E5CC)',
                border: 'none',
                borderRadius: 8,
                fontFamily: 'var(--font-mono)',
                fontSize: 12,
                fontWeight: 700,
                letterSpacing: 2,
                color: '#04061A',
                cursor: 'pointer',
                textTransform: 'uppercase',
                boxShadow: '0 0 30px #4D9FFF33'
              }}
            >
              LAUNCH APP ➤
            </button>
          </div>
        </div>

        {/* Right — Terminal preview */}
        <div style={{ width: '100%', maxWidth: 500 }}>
          <TerminalPreview />
        </div>
      </div>

      {/* Stats bar */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: isMobile ? '1fr' : 'repeat(3, 1fr)',
        margin: isMobile ? '0 20px' : '0 40px',
        border: '1px solid var(--border)',
        borderRadius: 12,
        overflow: 'hidden',
        background: 'var(--bg-card)'
      }}>
        {[
          { label: 'AGENTS REGISTERED', value: '1' },
          { label: 'TOTAL TRANSACTIONS', value: '—' },
          { label: 'STT VOLUME', value: '—' },
        ].map((stat, i) => (
          <div key={i} style={{
            padding: '20px 24px',
            borderRight: !isMobile && i < 2 ? '1px solid var(--border)' : 'none',
            borderBottom: isMobile && i < 2 ? '1px solid var(--border)' : 'none',
            textAlign: isMobile ? 'center' : 'left'
          }}>
            <div style={{
              fontFamily: 'var(--font-mono)',
              fontSize: 10,
              letterSpacing: 2,
              color: 'var(--muted)',
              textTransform: 'uppercase',
              marginBottom: 8
            }}>
              {stat.label}
            </div>
            <div style={{
              fontFamily: 'var(--font-head)',
              fontSize: 28,
              fontWeight: 900,
              color: 'var(--blue)'
            }}>
              {stat.value}
            </div>
          </div>
        ))}
      </div>

      {/* Features */}
      <div style={{ padding: isMobile ? '60px 20px' : '80px 40px', maxWidth: 1200, margin: '0 auto' }}>
        <div style={{ textAlign: 'center', marginBottom: 40 }}>
          <h2 style={{
            fontFamily: 'var(--font-head)',
            fontSize: isMobile ? 24 : 32,
            fontWeight: 900,
            color: 'var(--text)',
            marginBottom: 12
          }}>
            Empower Your Autonomous Agents
          </h2>
          <p style={{
            fontFamily: 'var(--font-body)',
            fontSize: 15,
            color: 'var(--muted)'
          }}>
            A three-layer architecture for decentralized agent finance.
          </p>
        </div>

        <div style={{ 
          display: 'grid', 
          gridTemplateColumns: isMobile ? '1fr' : 'repeat(3, 1fr)', 
          gap: 20 
        }}>
          {[
            {
              icon: '⚡',
              title: 'Natural Language Payments',
              desc: 'Say "send 0.5 STT to 0x..." and the agent handles signing, broadcasting, and confirmation on Somnia.',
              color: '#4D9FFF'
            },
            {
              icon: '🛡️',
              title: 'Policy Enforcement',
              desc: 'Per-tx caps, daily limits, whitelists, active hours, and circuit breakers — all enforced before any transaction fires.',
              color: '#FF6B35'
            },
            {
              icon: '📋',
              title: 'On-Chain Audit Log',
              desc: 'Every action is logged — executed, rejected, or failed — with Somnia Explorer links for full transparency.',
              color: '#00E5CC'
            }
          ].map((f, i) => (
            <div key={i} style={{
              background: 'var(--bg-card)',
              border: '1px solid var(--border)',
              borderRadius: 12,
              padding: '24px',
            }}>
              <div style={{ fontSize: 28, marginBottom: 16 }}>{f.icon}</div>
              <h3 style={{
                fontFamily: 'var(--font-head)',
                fontSize: 14,
                letterSpacing: 1,
                color: f.color,
                marginBottom: 12
              }}>
                {f.title}
              </h3>
              <p style={{
                fontFamily: 'var(--font-body)',
                fontSize: 14,
                color: 'var(--muted)',
                lineHeight: 1.7
              }}>
                {f.desc}
              </p>
            </div>
          ))}
        </div>
      </div>

      {/* Footer */}
      <div style={{
        borderTop: '1px solid var(--border)',
        padding: '24px 20px',
        display: 'flex',
        flexDirection: isMobile ? 'column' : 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        gap: 16,
        textAlign: 'center'
      }}>
        <span style={{
          fontFamily: 'var(--font-head)',
          fontSize: 14,
          background: 'linear-gradient(135deg, #4D9FFF, #00E5CC)',
          WebkitBackgroundClip: 'text',
          WebkitTextFillColor: 'transparent',
          backgroundClip: 'text'
        }}>
          AGENTPAY
        </span>
        <span style={{
          fontFamily: 'var(--font-mono)',
          fontSize: 9,
          color: 'var(--muted)',
          letterSpacing: 1
        }}>
          BUILT FOR SOMNIA AGENTATHON 2026
        </span>
      </div>

    </div>
  )
}

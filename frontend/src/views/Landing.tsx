import { ConnectButton } from '@rainbow-me/rainbowkit';
import { useAccount } from 'wagmi';

export default function Landing({ onLaunch }: { onLaunch: () => void }) {
  const { isConnected } = useAccount();

  return (
    <div style={{ minHeight: '100vh', background: '#0A0A0A', color: '#e5e2e1', fontFamily: 'Geist, sans-serif' }}>
      {/* Nav */}
      <nav style={{
        position: 'fixed', top: 0, left: 0, right: 0, height: 64,
        background: 'rgba(10,10,10,0.8)', backdropFilter: 'blur(12px)', borderBottom: '1px solid #262626',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '0 32px', zIndex: 50
      }}>
        <span style={{ fontFamily: 'Anybody, sans-serif', fontSize: 20, fontWeight: 700, color: '#4fdbc8' }}>AgentPay</span>
        <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
          <span className="nav-item" style={{ width: 'auto', color: '#bbcac6', cursor: 'pointer', fontSize: 13 }} onClick={onLaunch}>Terminal</span>
          <span className="nav-item" style={{ width: 'auto', color: '#bbcac6', cursor: 'pointer', fontSize: 13 }}>Docs</span>
          <ConnectButton />
        </div>
      </nav>

      <main style={{ paddingTop: 120, paddingBottom: 96 }}>
        {/* Hero */}
        <section style={{ maxWidth: 1200, margin: '0 auto', padding: '0 32px', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 64, alignItems: 'center' }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 28 }}>
            <div style={{
              display: 'inline-flex', alignItems: 'center', gap: 8,
              padding: '4px 12px', background: 'var(--surface-container-high)',
              border: '1px solid var(--outline-variant)', borderRadius: 8, width: 'fit-content'
            }}>
              <span className="material-symbols-outlined" style={{ fontSize: 16, color: 'var(--primary)' }}>bolt</span>
              <span style={{ fontFamily: 'JetBrains Mono', fontSize: 11, letterSpacing: '0.05em', textTransform: 'uppercase', color: 'var(--primary)' }}>Now Live on Somnia Testnet</span>
            </div>
            <h1 style={{ fontFamily: 'Anybody, sans-serif', fontSize: 48, fontWeight: 700, lineHeight: 1.1, letterSpacing: '-0.02em', color: 'var(--on-surface)' }}>
              The Payment Protocol for{' '}
              <span style={{ color: 'var(--primary)' }}>AI Agents.</span>
            </h1>
            <p style={{ fontSize: 14, color: 'var(--on-surface-variant)', maxWidth: 480, lineHeight: 1.6 }}>
              Enable autonomous, policy-driven STT transfers on Somnia using natural language. Give your agents the financial sovereignty they need with programmatic guardrails.
            </p>
            <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
              <button onClick={onLaunch} style={{
                padding: '14px 32px', background: '#4fdbc8', color: '#003731',
                border: 'none', borderRadius: 8, fontFamily: 'JetBrains Mono', fontSize: 13,
                fontWeight: 700, letterSpacing: '0.05em', textTransform: 'uppercase',
                cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 8
              }}>
                {isConnected ? 'Enter Application' : 'Launch Demo'}
                <span className="material-symbols-outlined" style={{ fontSize: 18 }}>arrow_forward</span>
              </button>
              {!isConnected && <ConnectButton label="Connect to Start" />}
            </div>
            </div>

          {/* Terminal mockup */}
          <div style={{ position: 'relative' }}>
            <div style={{
              background: '#0A0A0A', border: '1px solid var(--outline-variant)',
              borderRadius: 12, overflow: 'hidden',
              boxShadow: '0 0 40px -10px rgba(20,184,166,0.15)'
            }}>
              <div style={{
                background: 'var(--surface-container-high)', padding: '8px 16px',
                borderBottom: '1px solid var(--outline-variant)',
                display: 'flex', alignItems: 'center', justifyContent: 'space-between'
              }}>
                <div style={{ display: 'flex', gap: 8 }}>
                  <div style={{ width: 12, height: 12, borderRadius: '50%', background: 'rgba(255,180,171,0.4)' }} />
                  <div style={{ width: 12, height: 12, borderRadius: '50%', background: 'rgba(255,181,158,0.4)' }} />
                  <div style={{ width: 12, height: 12, borderRadius: '50%', background: 'rgba(79,219,200,0.4)' }} />
                </div>
                <span style={{ fontFamily: 'JetBrains Mono', fontSize: 11, color: 'var(--on-surface-variant)' }}>agentpay-v3.0.sh</span>
              </div>
              <div style={{ padding: 24, fontFamily: 'JetBrains Mono', fontSize: 13, lineHeight: 1.8, display: 'flex', flexDirection: 'column', gap: 16 }}>
                <div style={{ display: 'flex', gap: 12 }}>
                  <span style={{ color: 'var(--primary)' }}>User:</span>
                  <span style={{ color: 'var(--on-surface)' }}>pay 0.5 STT to 0xABC for quest reward</span>
                </div>
                <div style={{ display: 'flex', gap: 12 }}>
                  <span style={{ color: 'var(--on-surface-variant)' }}>Agent:</span>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                    <span style={{ color: 'var(--on-surface-variant)' }}>Checking policy...</span>
                    <span style={{ color: 'var(--primary)', display: 'flex', alignItems: 'center', gap: 6 }}>
                      <span className="material-symbols-outlined" style={{ fontSize: 14 }}>check_circle</span>
                      Spending cap OK.
                    </span>
                    <span style={{ color: 'var(--primary)', display: 'flex', alignItems: 'center', gap: 6 }}>
                      <span className="material-symbols-outlined" style={{ fontSize: 14 }}>check_circle</span>
                      Destination whitelisted.
                    </span>
                    <span style={{ color: 'var(--on-surface-variant)' }}>Executing transaction on Somnia...</span>
                  </div>
                </div>
                <div style={{ background: 'var(--surface-container)', padding: 12, borderLeft: '2px solid var(--primary)' }}>
                  <span style={{ color: 'var(--primary)', fontWeight: 700 }}>Success:</span>
                  <span style={{ color: 'var(--on-surface)', marginLeft: 8 }}>Block #82910 | TX: 0x92f...a12</span>
                </div>
                <span style={{ color: 'var(--primary)', animation: 'pulse 1s infinite' }}>_</span>
              </div>
            </div>
          </div>
        </section>

        {/* Stats */}
        <section style={{ maxWidth: 1200, margin: '96px auto 0', padding: '0 32px' }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', border: '1px solid var(--outline-variant)', background: 'var(--surface-container-low)' }}>
            {[
              { label: 'Agents Registered', value: '1,240' },
              { label: 'Total Transactions', value: '45.2k' },
              { label: 'STT Volume', value: '1.2M' },
            ].map((s, i) => (
              <div key={i} style={{
                padding: 40, display: 'flex', flexDirection: 'column', gap: 8,
                borderRight: i < 2 ? '1px solid var(--outline-variant)' : 'none'
              }}>
                <span className="stat-label">{s.label}</span>
                <span style={{ fontFamily: 'Anybody', fontSize: 28, fontWeight: 700, color: 'var(--primary)' }}>{s.value}</span>
              </div>
            ))}
          </div>
        </section>

        {/* How it works */}
        <section style={{ maxWidth: 1200, margin: '96px auto 0', padding: '0 32px' }}>
          <div style={{ textAlign: 'center', marginBottom: 56 }}>
            <h2 style={{ fontFamily: 'Anybody', fontSize: 28, fontWeight: 700, color: 'var(--on-surface)', marginBottom: 12 }}>
              Empower Your Autonomous Agents
            </h2>
            <p style={{ fontSize: 14, color: 'var(--on-surface-variant)' }}>A three-step architecture for decentralized agent finance.</p>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 16 }}>
            {[
              { icon: 'account_balance_wallet', title: 'Connect Wallet', desc: 'Integrate your Somnia wallet and designate treasury funds for agent operations.' },
              { icon: 'gavel', title: 'Set Policy', desc: 'Define spending caps, whitelisted addresses, and frequency limits using our policy engine.' },
              { icon: 'chat', title: 'Chat with Agent', desc: 'Send natural language commands to your agent. It understands, checks policy, and executes.' },
            ].map((s, i) => (
              <div key={i} className="card-dark" style={{ display: 'flex', flexDirection: 'column', gap: 20, padding: 28 }}>
                <div style={{
                  width: 44, height: 44, display: 'flex', alignItems: 'center', justifyContent: 'center',
                  background: 'var(--surface-container)', border: '1px solid var(--outline-variant)', color: 'var(--primary)'
                }}>
                  <span className="material-symbols-outlined" style={{ fontSize: 22 }}>{s.icon}</span>
                </div>
                <div>
                  <h3 style={{ fontFamily: 'Anybody', fontSize: 18, fontWeight: 600, color: 'var(--on-surface)', marginBottom: 8 }}>{s.title}</h3>
                  <p style={{ fontSize: 13, color: 'var(--on-surface-variant)', lineHeight: 1.6 }}>{s.desc}</p>
                </div>
              </div>
            ))}
          </div>
        </section>
      </main>

      {/* Footer */}
      <footer style={{ background: 'var(--surface)', borderTop: '1px solid var(--outline-variant)', padding: '64px 0' }}>
        <div style={{ maxWidth: 1200, margin: '0 auto', padding: '0 32px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 48, marginBottom: 48 }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <span style={{ fontFamily: 'Anybody', fontSize: 20, fontWeight: 700, color: 'var(--primary)' }}>AgentPay</span>
              <p style={{ fontSize: 13, color: 'var(--on-surface-variant)', maxWidth: 280, lineHeight: 1.6 }}>
                The world's first intent-based payment gateway for the agentic economy.
              </p>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 48 }}>
              {[
                { title: 'Protocol', links: ['Terminal', 'Registry', 'Governance'] },
                { title: 'Resources', links: ['Documentation', 'SDK Guide', 'Security Audit'] },
                { title: 'Social', links: ['X / Twitter', 'Discord', 'GitHub'] },
              ].map((col, i) => (
                <div key={i} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                  <span style={{ fontFamily: 'JetBrains Mono', fontSize: 11, letterSpacing: '0.05em', textTransform: 'uppercase', color: 'var(--on-surface)' }}>{col.title}</span>
                  {col.links.map(link => (
                    <a key={link} style={{ fontSize: 13, color: 'var(--on-surface-variant)', cursor: 'pointer', textDecoration: 'none' }}>{link}</a>
                  ))}
                </div>
              ))}
            </div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', paddingTop: 24, borderTop: '1px solid var(--outline-variant)' }}>
            <p style={{ fontFamily: 'JetBrains Mono', fontSize: 11, color: 'var(--on-surface-variant)', letterSpacing: '0.05em' }}>
              © 2026 AgentPay Protocol. All rights reserved.
            </p>
            <div style={{
              display: 'flex', alignItems: 'center', gap: 8,
              padding: '6px 14px', background: 'var(--surface-container)',
              border: '1px solid var(--outline-variant)', borderRadius: 20
            }}>
              <span style={{ fontFamily: 'JetBrains Mono', fontSize: 11, color: 'var(--on-surface-variant)' }}>Built on</span>
              <span style={{ fontFamily: 'Anybody', fontWeight: 700, color: 'var(--on-surface)' }}>SOMNIA</span>
              <div style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--primary)' }} />
            </div>
          </div>
        </div>
      </footer>
    </div>
  )
}

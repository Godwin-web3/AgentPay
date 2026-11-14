export default function Landing({ onLaunch }: { onLaunch: () => void }) {
  return (
    <div style={{
      minHeight: '100dvh',
      background: `#141311 url('/stone.jpg') center/cover no-repeat`,
      color: '#161513',
      position: 'relative',
      overflow: 'hidden',
    }}>
      <div style={{
        position: 'absolute',
        inset: 0,
        background: 'linear-gradient(180deg, rgba(243,240,232,0.2) 0%, rgba(243,240,232,0.55) 48%, rgba(243,240,232,0.92) 100%)',
      }} />
      <div style={{ position: 'relative', zIndex: 1, minHeight: '100dvh', display: 'flex', flexDirection: 'column', padding: '22px 22px 28px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span style={{ fontFamily: 'var(--font-head)', fontWeight: 500, fontSize: 18, letterSpacing: '-0.03em' }}>AgentPay</span>
          <button onClick={onLaunch} style={{ background: 'none', border: 'none', color: '#161513', fontFamily: 'var(--font-body)', fontSize: 15, cursor: 'pointer' }}>Enter</button>
        </div>
        <div style={{ marginTop: 'auto', maxWidth: 680 }}>
          <h1 style={{
            fontFamily: 'var(--font-head)',
            fontWeight: 500,
            fontSize: 'clamp(64px, 16vw, 120px)',
            lineHeight: 0.84,
            letterSpacing: '-0.05em',
            margin: 0,
          }}>
            Say it.<br />It moves.
          </h1>
          <p style={{ margin: '22px 0 0', maxWidth: '28ch', fontSize: 17, lineHeight: 1.4, color: '#3c3832' }}>
            One place for USDC. Pay, swap, deposit, and bridge. You confirm. The vault enforces the limit.
          </p>
          <button onClick={onLaunch} style={{
            marginTop: 28,
            background: '#161513',
            color: '#f3f0e8',
            border: 'none',
            padding: '14px 22px',
            fontFamily: 'var(--font-head)',
            fontSize: 16,
            fontWeight: 500,
            letterSpacing: '-0.02em',
            cursor: 'pointer',
          }}>
            Enter the wallet
          </button>
        </div>
      </div>
    </div>
  )
}

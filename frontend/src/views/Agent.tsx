const AGENT_ADDRESS = '0x80ea270e071b315AE70aC5DE00B05491FFA98580'
const IDENTITY_REGISTRY = '0x8004A818BFB912233c491871b3d84c89A494B9e'
const TOKENS = [
  { id: '722871', uriTx: '0x440a5fe9d5f468a7481578f7abc8b455664ccbcb68226233915da9a9524f2c' },
  { id: '722856', uriTx: '0xbf5177a435250995cc6513b82cb074df56b4293e37679fcf15f1101a5f72b4d81' },
]

export default function Agent() {
  return (
    <div className="view-container" style={{ padding: 20 }}>
      <h2 style={{ marginBottom: 24 }}>Agent Identity</h2>

      <div className="card" style={{ marginBottom: 16 }}>
        <div style={{ fontSize: 10, color: 'var(--muted)', textTransform: 'uppercase', marginBottom: 4 }}>Agent Address</div>
        <div style={{ fontFamily: 'var(--font-mono)', fontSize: 12, wordBreak: 'break-all' }}>{AGENT_ADDRESS}</div>
        <a
          href={`https://testnet.arcscan.app/address/${AGENT_ADDRESS}`}
          target="_blank"
          rel="noreferrer"
          style={{ fontSize: 12, color: 'var(--cyan)', display: 'inline-block', marginTop: 8 }}
        >
          View on Arcscan
        </a>
      </div>

      <div className="card" style={{ marginBottom: 16 }}>
        <div style={{ fontSize: 10, color: 'var(--muted)', textTransform: 'uppercase', marginBottom: 4 }}>ERC-8004 Identity Registry</div>
        <div style={{ fontFamily: 'var(--font-mono)', fontSize: 12, wordBreak: 'break-all' }}>{IDENTITY_REGISTRY}</div>
        <a
          href={`https://testnet.arcscan.app/address/${IDENTITY_REGISTRY}`}
          target="_blank"
          rel="noreferrer"
          style={{ fontSize: 12, color: 'var(--cyan)', display: 'inline-block', marginTop: 8 }}
        >
          View on Arcscan
        </a>
      </div>

      <div style={{ marginBottom: 12, fontSize: 12, color: 'var(--muted)', textTransform: 'uppercase' }}>
        Registered Tokens
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        {TOKENS.map(t => (
          <div key={t.id} className="card">
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 12 }}>
              <div style={{ fontWeight: 600, color: 'var(--cyan)' }}>Token #{t.id}</div>
              <div style={{
                fontSize: 10,
                padding: '2px 6px',
                borderRadius: 4,
                background: 'rgba(0,255,255,0.1)',
                color: 'var(--cyan)',
                border: '1px solid currentColor'
              }}>
                REGISTERED
              </div>
            </div>
            <a
              href={`https://testnet.arcscan.app/tx/${t.uriTx}`}
              target="_blank"
              rel="noreferrer"
              style={{ fontSize: 12, color: 'var(--cyan)' }}
            >
              View setAgentURI transaction
            </a>
          </div>
        ))}
      </div>
    </div>
  )
}

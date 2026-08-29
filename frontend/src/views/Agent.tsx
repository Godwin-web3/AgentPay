// Confirmed live via the operator's on-chain activity — the value that was
// here before (0x80ea270e...) is stale and doesn't match the address that
// actually signs transactions today.
const AGENT_ADDRESS = '0x9ac6869f641d49023da150094519bb16ae3e0b80'
const IDENTITY_REGISTRY = '0x8004A818BFB912233c491871b3d84c89A494B9e'
const TOKENS = [
  { id: '722871', uriTx: '0x440a5fe9d5f468a7481578f7abc8b455664ccbcb68226233915da9a9524f2c' },
  { id: '722856', uriTx: '0xbf5177a435250995cc6513b82cb074df56b4293e37679fcf15f1101a5f72b4d81' },
]

export default function Agent() {
  return (
    <div className="view-container" style={{ padding: 20 }}>
      <div className="reveal" style={{ marginBottom: 28 }}>
        <p className="eyebrow">Who's actually signing</p>
        <h2 className="page-title">Agent Identity</h2>
      </div>

      <div className="card-deep reveal" style={{ marginBottom: 16, padding: 24 }}>
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

      <p className="eyebrow">Registered tokens</p>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        {TOKENS.map(t => (
          <div key={t.id} className="card">
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 12 }}>
              <div style={{ fontFamily: 'var(--font-head)', fontWeight: 600, fontSize: 16, color: 'var(--cyan)' }}>Token #{t.id}</div>
              <div style={{
                fontSize: 10,
                padding: '2px 6px',
                borderRadius: 4,
                background: 'var(--cyan-a1)',
                color: 'var(--cyan)',
                border: '1px solid var(--border-hot)'
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

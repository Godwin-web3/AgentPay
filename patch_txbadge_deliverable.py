path = "frontend/src/views/Terminal.tsx"

with open(path, "r") as f:
    content = f.read()

old = """    return (
      <a href={result.explorer} target="_blank" rel="noreferrer" style={{ display: 'block', marginTop: 10, textDecoration: 'none', fontFamily: 'var(--font-mono)', fontSize: 11, padding: '10px 14px', border: '1px solid rgba(79,219,200,0.3)', background: 'rgba(79,219,200,0.04)', color: 'var(--cyan)' }}>
        <div style={{ letterSpacing: 1, marginBottom: 4 }}>+ {label}</div>
        {result.txHash && <div style={{ fontSize: 10, color: 'var(--muted)' }}>TX {result.txHash.slice(0, 18)}... -&gt;</div>}
        <div style={{ marginTop: 4, fontSize: 9, color: 'var(--muted)', letterSpacing: 1 }}>FINALIZED IN &lt; 1s — ARC TESTNET</div>
      </a>
    )
  }"""

new = """    return (
      <div style={{ marginTop: 10 }}>
        <a href={result.explorer} target="_blank" rel="noreferrer" style={{ display: 'block', textDecoration: 'none', fontFamily: 'var(--font-mono)', fontSize: 11, padding: '10px 14px', border: '1px solid rgba(79,219,200,0.3)', background: 'rgba(79,219,200,0.04)', color: 'var(--cyan)' }}>
          <div style={{ letterSpacing: 1, marginBottom: 4 }}>+ {label}</div>
          {result.txHash && <div style={{ fontSize: 10, color: 'var(--muted)' }}>TX {result.txHash.slice(0, 18)}... -&gt;</div>}
          <div style={{ marginTop: 4, fontSize: 9, color: 'var(--muted)', letterSpacing: 1 }}>FINALIZED IN &lt; 1s — ARC TESTNET</div>
        </a>
        {result.type === 'hire' && !result.deliverableText && (
          <div style={{ marginTop: 6, fontSize: 10, color: 'var(--muted)', fontFamily: 'var(--font-mono)', padding: '8px 14px' }}>
            Waiting for delivery...
          </div>
        )}
        {result.deliverableText && (
          <div style={{ marginTop: 6, fontSize: 12, color: 'var(--text)', fontFamily: 'var(--font-body)', padding: '10px 14px', border: '1px solid var(--border)', background: 'var(--bg-card)', whiteSpace: 'pre-wrap' }}>
            {result.deliverableText}
          </div>
        )}
      </div>
    )
  }"""

if old not in content:
    print("MARKER NOT FOUND. Aborting, no changes made.")
    exit(1)

content = content.replace(old, new)

with open(path, "w") as f:
    f.write(content)

print("Patched: TxBadge now renders deliverableText, or a waiting state for hire jobs.")

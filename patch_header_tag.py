import re

path = "frontend/src/components/AgentHeader.tsx"

with open(path, "r") as f:
    content = f.read()

old = """          {tag && tag !== 'skip' && (
            <div style={{
              padding: '2px 8px',
              borderRadius: 3,
              fontFamily: 'var(--font-mono)',
              fontSize: 10,
              fontWeight: 700,
              letterSpacing: 0.5,
              background: 'rgba(217,164,65,0.08)',
              border: '1px solid var(--seal)',
              color: 'var(--seal)',
            }}>
              @{tag}
            </div>
          )}"""

new = """          {tag && tag !== 'skip' && (
            <div style={{
              display: 'flex',
              alignItems: 'center',
              gap: 5,
              fontFamily: 'var(--font-mono)',
              fontSize: 10,
              fontWeight: 700,
              letterSpacing: 0.5,
              color: 'var(--seal)',
            }}>
              <span style={{
                width: 5,
                height: 5,
                borderRadius: '50%',
                background: 'var(--seal)',
                display: 'inline-block',
                boxShadow: '0 0 4px var(--seal)',
              }} />
              @{tag}
            </div>
          )}"""

if old not in content:
    print("MARKER NOT FOUND. Aborting, no changes made.")
    exit(1)

content = content.replace(old, new)

with open(path, "w") as f:
    f.write(content)

print("Patched: tag now floats with a glowing dot, no box.")

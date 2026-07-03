path = "frontend/src/views/Profile.tsx"

with open(path, "r") as f:
    content = f.read()

old = """          <button
            onClick={() => navigator.clipboard.writeText(userAddress)}
            style={{ background: 'transparent', border: 'none', color: 'var(--muted)', cursor: 'pointer', fontSize: 11, fontFamily: 'var(--font-mono)', padding: 0 }}
            title="Copy full address"
          >
            copy
          </button>"""

new = """          <button
            onClick={(e) => {
              const btn = e.currentTarget
              const original = btn.textContent
              const fallbackCopy = () => {
                const el = document.createElement('textarea')
                el.value = userAddress
                el.style.position = 'fixed'
                el.style.opacity = '0'
                document.body.appendChild(el)
                el.select()
                try { document.execCommand('copy') } catch {}
                document.body.removeChild(el)
              }
              if (navigator.clipboard && window.isSecureContext) {
                navigator.clipboard.writeText(userAddress).catch(fallbackCopy)
              } else {
                fallbackCopy()
              }
              btn.textContent = 'copied'
              setTimeout(() => { btn.textContent = original }, 1200)
            }}
            style={{ background: 'transparent', border: 'none', color: 'var(--muted)', cursor: 'pointer', fontSize: 11, fontFamily: 'var(--font-mono)', padding: 0 }}
            title="Copy full address"
          >
            copy
          </button>"""

if old not in content:
    print("MARKER NOT FOUND. Aborting, no changes made.")
    exit(1)

content = content.replace(old, new)

with open(path, "w") as f:
    f.write(content)

print("Patched: copy button now has fallback and confirms with 'copied' text.")

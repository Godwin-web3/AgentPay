import re

path = "frontend/src/views/Profile.tsx"

with open(path, "r") as f:
    content = f.read()

changed = False

# 1. Identity strip tag: remove box, add glowing dot
tag_pattern = re.compile(
    r"\{tag && tag !== 'skip' && \(.*?@\{tag\}.*?\)\}",
    re.DOTALL
)

tag_replacement = """{tag && tag !== 'skip' && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 5, fontFamily: 'var(--font-mono)', color: 'var(--seal)', fontSize: 13, fontWeight: 700 }}>
              <span style={{ width: 5, height: 5, borderRadius: '50%', background: 'var(--seal)', display: 'inline-block', boxShadow: '0 0 4px var(--seal)' }} />
              @{tag}
            </div>
          )}"""

if tag_pattern.search(content):
    content = tag_pattern.sub(tag_replacement, content, count=1)
    changed = True
    print("Tag block patched.")
else:
    print("Tag block NOT found. Skipped.")

# 2. Wallet address: truncate + copy button instead of raw break-all string
addr_marker = "{userAddress}</div>"
count = content.count(addr_marker)

if count == 1:
    old_addr = "<div style={{ fontFamily: 'var(--font-mono)', color: 'var(--text)', fontSize: 13, wordBreak: 'break-all', marginBottom: 8 }}>{userAddress}</div>"
    new_addr = """<div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
          <span style={{ fontFamily: 'var(--font-mono)', color: 'var(--text)', fontSize: 13 }}>{shortAddr(userAddress)}</span>
          <button
            onClick={() => navigator.clipboard.writeText(userAddress)}
            style={{ background: 'transparent', border: 'none', color: 'var(--muted)', cursor: 'pointer', fontSize: 11, fontFamily: 'var(--font-mono)', padding: 0 }}
            title="Copy full address"
          >
            copy
          </button>
        </div>"""
    if old_addr in content:
        content = content.replace(old_addr, new_addr, 1)
        changed = True
        print("Wallet address block patched.")
    else:
        print("Wallet address block markup mismatch. Skipped, no changes made to this part.")
        print("Send me: sed -n '105,118p' frontend/src/views/Profile.tsx")
else:
    print(f"Wallet address marker found {count} times, expected 1. Skipped for safety.")

if changed:
    with open(path, "w") as f:
        f.write(content)
    print("File saved.")
else:
    print("Nothing written.")

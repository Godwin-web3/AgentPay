#!/usr/bin/env python3

path = "frontend/src/App.tsx"
with open(path) as f:
    content = f.read()

old = '''    <div className="app">
      <div style={{ position: 'fixed', top: 0, left: 0, zIndex: 99999, background: 'red', color: 'white', fontSize: 10, padding: 4, fontFamily: 'monospace' }}>{debugInfo}</div>'''
new = '''    <div className="app">'''

if old not in content:
    raise SystemExit("PATCH FAILED: debug badge not found")
content = content.replace(old, new, 1)

with open(path, "w") as f:
    f.write(content)

print("✅ Removed debug badge")

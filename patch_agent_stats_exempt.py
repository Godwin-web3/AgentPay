#!/usr/bin/env python3

path = "src/server.js"
with open(path) as f:
    content = f.read()

old = """    '/api/jobs/mine',
  ];"""

new = """    '/api/jobs/mine',
    '/api/agent-stats',
  ];"""

if old not in content:
    raise SystemExit("PATCH FAILED: exempt array not found")

content = content.replace(old, new, 1)

with open(path, "w") as f:
    f.write(content)
print("Patched src/server.js — /api/agent-stats exempt from API key")

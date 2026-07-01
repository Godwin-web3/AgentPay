#!/usr/bin/env python3

path = "src/server.js"
with open(path) as f:
    content = f.read()

old = """    '/api/market/jobs',
    '/market-intel',
  ];"""

new = """    '/api/market/jobs',
    '/market-intel',
    '/api/jobs/mine',
  ];"""

if old not in content:
    raise SystemExit("PATCH FAILED: exempt array not found")

content = content.replace(old, new, 1)

with open(path, "w") as f:
    f.write(content)
print("Patched src/server.js — /api/jobs/mine exempt from API key")

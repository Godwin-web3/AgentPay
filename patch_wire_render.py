#!/usr/bin/env python3

path = "frontend/src/App.tsx"
with open(path) as f:
    content = f.read()

old = "            {view === 'policy'   && <Policy userAddress={userAddress} userId={userId} />}"
new = "            {view === 'policy'   && <Policy userAddress={userAddress} userId={userId} />}\n            {view === 'jobs' && <Jobs userAddress={userAddress} userId={userId} />}\n            {view === 'marketplace' && <Marketplace userAddress={userAddress} userId={userId} />}"

if old not in content:
    raise SystemExit("PATCH FAILED: policy render line not found")
content = content.replace(old, new, 1)

with open(path, "w") as f:
    f.write(content)
print("Patched render lines")

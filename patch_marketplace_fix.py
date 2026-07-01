#!/usr/bin/env python3

path = "frontend/src/views/Marketplace.tsx"
with open(path) as f:
    content = f.read()

old1 = "      setMarket(res.market || res)"
new1 = "      setMarket({ ...res.market, recentJobs: res.recentJobs || [] })"

if old1 not in content:
    raise SystemExit("PATCH FAILED: setMarket line not found")
content = content.replace(old1, new1, 1)

old2 = "{market.averageBudget} USDC"
new2 = "{market.averageBudget}"

if old2 not in content:
    raise SystemExit("PATCH FAILED: averageBudget line not found")
content = content.replace(old2, new2, 1)

with open(path, "w") as f:
    f.write(content)
print("Patched Marketplace.tsx: fixed recentJobs and averageBudget")

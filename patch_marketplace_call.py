#!/usr/bin/env python3
path = "frontend/src/views/Marketplace.tsx"
with open(path) as f:
    content = f.read()

# Ensure it passes userId correctly and logs errors better
content = content.replace(
    "const res = await getMarketJobs(userId)",
    "const res = await getMarketJobs(userId || 'demo'); console.log('Market data:', res);"
)

content = content.replace(
    "setError('Failed to load market data')",
    "setError(err?.message || 'Failed to load market data')"
)

print("✅ Fixed Marketplace API call")
with open(path, "w") as f:
    f.write(content)

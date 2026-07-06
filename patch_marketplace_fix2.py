#!/usr/bin/env python3
path = "frontend/src/views/Marketplace.tsx"
with open(path) as f:
    content = f.read()

# Improve loading and error handling
content = content.replace(
    'if (loading && !market) return (',
    'if (loading) return ('
)

content = content.replace(
    "setError('Failed to load market data')",
    "setError(err.message || 'Failed to load market data. Check connection or try again.')"
)

print("✅ Improved Marketplace error handling and loading state")
with open(path, "w") as f:
    f.write(content)

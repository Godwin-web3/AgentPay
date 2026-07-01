#!/usr/bin/env python3

path = "frontend/src/App.tsx"
with open(path) as f:
    content = f.read()

old = """  useEffect(() => {
    if (userAddress) {
      refreshBalances()
    }
  }, [userAddress])"""

new = """  useEffect(() => {
    if (userAddress) {
      refreshBalances()
    }
  }, [userAddress])

  useEffect(() => {
    if (!userAddress) return
    const interval = setInterval(() => {
      refreshBalances()
    }, 30000)
    return () => clearInterval(interval)
  }, [userAddress])"""

if old not in content:
    raise SystemExit("PATCH FAILED: userAddress effect block not found")
content = content.replace(old, new, 1)

with open(path, "w") as f:
    f.write(content)

print("✅ Patched frontend/src/App.tsx — balances now poll every 30s")

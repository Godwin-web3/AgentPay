#!/usr/bin/env python3

path = "frontend/src/views/Profile.tsx"
with open(path) as f:
    content = f.read()

old = "export default function Profile({ userAddress, userId, vaultBalance, walletBalance, tokenBalances, activeProvider, onActionSuccess, agentWalletAddress, agentWalletBalance, tag }: Props) {"
new = "export default function Profile({ userAddress, userId, vaultBalance, walletBalance, tokenBalances, activeProvider, onActionSuccess, agentWalletAddress, tag }: Props) {"

if old not in content:
    raise SystemExit("PATCH FAILED: function signature not found")
content = content.replace(old, new, 1)

with open(path, "w") as f:
    f.write(content)

print("✅ Removed unused agentWalletBalance param")

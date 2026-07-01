#!/usr/bin/env python3

path = "src/server.js"
with open(path) as f:
    content = f.read()

old = """              const txHash = await walletService.executeOnChainSchedule(agentWalletId, vaultAddr, wallet.address, s.id);
              await appendSpend({
                userAddress: wallet.address,
                to: s.to,
                amount: s.amount,
                reason: s.reason,
                txHash,
                isScheduled: true,
                type: 'payment'
              });"""

new = """              const txHash = await walletService.executeOnChainSchedule(agentWalletId, vaultAddr, wallet.address, s.id);
              await appendSpend({
                userAddress: userAddress,
                to: s.to,
                amount: s.amount,
                reason: s.reason,
                txHash,
                isScheduled: true,
                type: 'payment'
              });"""

if old not in content:
    raise SystemExit("PATCH FAILED: appendSpend block not found (already patched?)")
content = content.replace(old, new, 1)

with open(path, "w") as f:
    f.write(content)

print("✅ Patched src/server.js — appendSpend now uses Firebase uid, matching existing convention")

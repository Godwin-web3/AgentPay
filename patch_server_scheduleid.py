#!/usr/bin/env python3

path = "src/server.js"
with open(path) as f:
    content = f.read()

old_require = "      const { getActiveUsers, appendSpend } = require('./spendStore');"
new_require = "      const { getActiveUsers, appendSpend, appendFailure } = require('./spendStore');"

if old_require not in content:
    raise SystemExit("PATCH FAILED (require): text not found")
content = content.replace(old_require, new_require, 1)

old_block = """              const txHash = await walletService.executeOnChainSchedule(agentWalletId, vaultAddr, wallet.address, s.id);
              await appendSpend({
                userAddress: userAddress,
                to: s.to,
                amount: s.amount,
                reason: s.reason,
                txHash,
                isScheduled: true,
                type: 'payment'
              });
              console.log('✅ On-chain schedule ' + s.id + ' executed');"""

new_block = """              const txHash = await walletService.executeOnChainSchedule(agentWalletId, vaultAddr, wallet.address, s.id);
              await appendSpend({
                userAddress: userAddress,
                to: s.to,
                amount: s.amount,
                reason: s.reason,
                txHash,
                isScheduled: true,
                scheduleId: s.id,
                type: 'payment'
              });
              console.log('✅ On-chain schedule ' + s.id + ' executed');"""

if old_block not in content:
    raise SystemExit("PATCH FAILED (success block): text not found")
content = content.replace(old_block, new_block, 1)

with open(path, "w") as f:
    f.write(content)

print("✅ Patched src/server.js — scheduleId added to require + success appendSpend call")

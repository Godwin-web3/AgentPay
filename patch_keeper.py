#!/usr/bin/env python3
import re

path = "src/server.js"
with open(path) as f:
    content = f.read()

old = """      const { getActiveUsers } = require('./spendStore');"""
new = """      const { getActiveUsers, appendSpend } = require('./spendStore');"""

if old not in content:
    raise SystemExit("PATCH FAILED: destructure line not found")
content = content.replace(old, new, 1)

old2 = """              const agentWalletId = process.env.AGENT_WALLET_ID || wallet.walletId;
              console.log('[Keeper] executing with agentWalletId=' + agentWalletId + ' vault=' + vaultAddr + ' user=' + wallet.address + ' index=' + s.id);
              await walletService.executeOnChainSchedule(agentWalletId, vaultAddr, wallet.address, s.id);
              console.log('✅ On-chain schedule ' + s.id + ' executed');"""

new2 = """              const agentWalletId = process.env.AGENT_WALLET_ID || wallet.walletId;
              console.log('[Keeper] executing with agentWalletId=' + agentWalletId + ' vault=' + vaultAddr + ' user=' + wallet.address + ' index=' + s.id);
              const txHash = await walletService.executeOnChainSchedule(agentWalletId, vaultAddr, wallet.address, s.id);
              await appendSpend({
                userAddress: wallet.address,
                to: s.to,
                amount: s.amount,
                reason: s.reason,
                txHash,
                isScheduled: true,
                type: 'payment'
              });
              console.log('✅ On-chain schedule ' + s.id + ' executed');"""

if old2 not in content:
    raise SystemExit("PATCH FAILED: keeper execute block not found")
content = content.replace(old2, new2, 1)

with open(path, "w") as f:
    f.write(content)

print("✅ Patched src/server.js — keeper now calls appendSpend after each execution")

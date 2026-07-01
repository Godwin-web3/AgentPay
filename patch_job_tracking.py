#!/usr/bin/env python3

# 1. spendStore.js — let appendSpend optionally store a jobId
path1 = "src/spendStore.js"
with open(path1) as f:
    content1 = f.read()

old1 = """async function appendSpend({ userAddress, to, amount, reason, txHash, agentId, token, isScheduled, triggerProof, type }) {
  await db.collection(COLLECTION).add({
    userAddress,
    type: type || 'payment',
    to,
    amount,
    token: token || 'USDC',
    reason,
    txHash,
    agentId: agentId ? agentId.toString() : null,
    isScheduled: !!isScheduled,
    triggerProof: triggerProof || null,
    timestamp: Date.now(),
    date: new Date().toDateString()
  });
}"""

new1 = """async function appendSpend({ userAddress, to, amount, reason, txHash, agentId, jobId, token, isScheduled, triggerProof, type }) {
  await db.collection(COLLECTION).add({
    userAddress,
    type: type || 'payment',
    to,
    amount,
    token: token || 'USDC',
    reason,
    txHash,
    agentId: agentId ? agentId.toString() : null,
    jobId: jobId !== undefined && jobId !== null ? jobId.toString() : null,
    isScheduled: !!isScheduled,
    triggerProof: triggerProof || null,
    timestamp: Date.now(),
    date: new Date().toDateString()
  });
}"""

if old1 not in content1:
    raise SystemExit("PATCH FAILED (spendStore.js): appendSpend not found")
content1 = content1.replace(old1, new1, 1)

with open(path1, "w") as f:
    f.write(content1)
print("✅ Patched src/spendStore.js")

# 2. agent.js — pass jobId + type when hiring
path2 = "src/agent.js"
with open(path2) as f:
    content2 = f.read()

old2 = """    await appendSpend({ userAddress, to: providerAddress, amount: budget, reason: description, txHash: fundTxHash, token: 'USDC' });"""
new2 = """    await appendSpend({ userAddress, to: providerAddress, amount: budget, reason: description, txHash: fundTxHash, token: 'USDC', jobId, type: 'job_hire' });"""

if old2 not in content2:
    raise SystemExit("PATCH FAILED (agent.js): appendSpend hire call not found")
content2 = content2.replace(old2, new2, 1)

with open(path2, "w") as f:
    f.write(content2)
print("✅ Patched src/agent.js")

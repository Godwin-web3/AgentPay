#!/usr/bin/env python3

path = "src/spendStore.js"
with open(path) as f:
    content = f.read()

old_spend = """async function appendSpend({ userAddress, to, amount, reason, txHash, agentId, jobId, token, isScheduled, triggerProof, type }) {
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

new_spend = """async function appendSpend({ userAddress, to, amount, reason, txHash, agentId, jobId, scheduleId, token, isScheduled, triggerProof, type }) {
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
    scheduleId: scheduleId !== undefined && scheduleId !== null ? scheduleId.toString() : null,
    isScheduled: !!isScheduled,
    triggerProof: triggerProof || null,
    timestamp: Date.now(),
    date: new Date().toDateString()
  });
}"""

if old_spend not in content:
    raise SystemExit("PATCH FAILED (spend): current appendSpend text doesn't match")
content = content.replace(old_spend, new_spend, 1)

old_fail = """async function appendFailure({ userAddress, to, amount, reason, blockedReason, agentId }) {
  await db.collection(COLLECTION).add({
    userAddress,
    to,
    amount,
    reason,
    blockedReason: blockedReason ? blockedReason.slice(0, 100) : '',
    agentId: agentId ? agentId.toString() : null,
    failed: true,
    timestamp: Date.now(),
    date: new Date().toDateString()
  });
}"""

new_fail = """async function appendFailure({ userAddress, to, amount, reason, blockedReason, agentId, scheduleId }) {
  await db.collection(COLLECTION).add({
    userAddress,
    to,
    amount,
    reason,
    blockedReason: blockedReason ? blockedReason.slice(0, 100) : '',
    agentId: agentId ? agentId.toString() : null,
    scheduleId: scheduleId !== undefined && scheduleId !== null ? scheduleId.toString() : null,
    isScheduled: scheduleId !== undefined && scheduleId !== null,
    failed: true,
    timestamp: Date.now(),
    date: new Date().toDateString()
  });
}"""

if old_fail not in content:
    raise SystemExit("PATCH FAILED (fail): current appendFailure text doesn't match")
content = content.replace(old_fail, new_fail, 1)

with open(path, "w") as f:
    f.write(content)

print("✅ Patched src/spendStore.js — appendSpend + appendFailure now accept scheduleId")

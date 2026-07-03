#!/usr/bin/env python3

# 1. spendStore.js — add scheduleId to appendSpend + appendFailure, add getScheduleStats
path1 = "src/spendStore.js"
with open(path1) as f:
    c1 = f.read()

old_append_spend = """async function appendSpend({ userAddress, to, amount, reason, txHash, agentId, jobId, token, isScheduled, triggerProof, type }) {
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

new_append_spend = """async function appendSpend({ userAddress, to, amount, reason, txHash, agentId, jobId, scheduleId, token, isScheduled, triggerProof, type }) {
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

if old_append_spend not in c1:
    raise SystemExit("PATCH FAILED (1): appendSpend not found")
c1 = c1.replace(old_append_spend, new_append_spend, 1)

old_append_failure = """async function appendFailure({ userAddress, to, amount, reason, blockedReason, agentId }) {
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

new_append_failure = """async function appendFailure({ userAddress, to, amount, reason, blockedReason, agentId, scheduleId }) {
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

if old_append_failure not in c1:
    raise SystemExit("PATCH FAILED (2): appendFailure not found")
c1 = c1.replace(old_append_failure, new_append_failure, 1)

old_exports = """module.exports = {
  appendSpend,
  appendSwap,
  appendFailure,
  appendInference,
  getTodaySpend,
  getLastHourTxCount,
  getConsecutiveFailures,
  getHistory,
  trackUser,
  getActiveUsers
};"""

new_exports = """async function getScheduleStats(userAddress) {
  let query = db.collection(COLLECTION).where('isScheduled', '==', true);
  if (userAddress) query = query.where('userAddress', '==', userAddress);
  const snapshot = await query.get();
  const stats = {};
  snapshot.forEach(doc => {
    const s = doc.data();
    if (!s.scheduleId) return;
    if (!stats[s.scheduleId]) stats[s.scheduleId] = { success: 0, failed: 0, lastRun: 0 };
    if (s.failed) stats[s.scheduleId].failed++;
    else stats[s.scheduleId].success++;
    if (s.timestamp > stats[s.scheduleId].lastRun) stats[s.scheduleId].lastRun = s.timestamp;
  });
  return stats;
}

module.exports = {
  appendSpend,
  appendSwap,
  appendFailure,
  appendInference,
  getTodaySpend,
  getLastHourTxCount,
  getConsecutiveFailures,
  getHistory,
  getScheduleStats,
  trackUser,
  getActiveUsers
};"""

if old_exports not in c1:
    raise SystemExit("PATCH FAILED (3): exports block not found")
c1 = c1.replace(old_exports, new_exports, 1)

with open(path1, "w") as f:
    f.write(c1)
print("✅ Patched src/spendStore.js — scheduleId tracking + getScheduleStats added")

# 2. server.js — tag keeper's appendSpend with scheduleId, log failures too, add /schedules/stats route
path2 = "src/server.js"
with open(path2) as f:
    c2 = f.read()

old_keeper_success = """              const { getActiveUsers, appendSpend } = require('./spendStore');"""
new_keeper_success = """              const { getActiveUsers, appendSpend, appendFailure } = require('./spendStore');"""
# NOTE: this require is actually higher up in runKeeper — handled by next block instead
"""placeholder"""

old_import_line = "      const { getActiveUsers, appendSpend } = require('./spendStore');"
new_import_line = "      const { getActiveUsers, appendSpend, appendFailure } = require('./spendStore');"
if old_import_line not in c2:
    raise SystemExit("PATCH FAILED (4): keeper require line not found")
c2 = c2.replace(old_import_line, new_import_line, 1)

old_success_block = """              const txHash = await walletService.executeOnChainSchedule(agentWalletId, vaultAddr, wallet.address, s.id);
              await appendSpend({
                userAddress: userAddress,
                to: s.to,
                amount: s.amount,
                reason: s.reason,
                txHash,
                isScheduled: true,
                type: 'payment'
              });
              console.log('✅ On-chain schedule ' + s.id + ' executed');
            } catch (err) {
              console.error('❌ Schedule ' + s.id + ' failed:', err.message);
            }"""

new_success_block = """              const txHash = await walletService.executeOnChainSchedule(agentWalletId, vaultAddr, wallet.address, s.id);
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
              console.log('✅ On-chain schedule ' + s.id + ' executed');
            } catch (err) {
              console.error('❌ Schedule ' + s.id + ' failed:', err.message);
              try {
                await appendFailure({
                  userAddress: userAddress,
                  to: s.to,
                  amount: s.amount,
                  reason: s.reason,
                  blockedReason: err.message,
                  scheduleId: s.id
                });
              } catch (logErr) {
                console.error('❌ Failed to log schedule failure:', logErr.message);
              }
            }"""

if old_success_block not in c2:
    raise SystemExit("PATCH FAILED (5): keeper success/catch block not found")
c2 = c2.replace(old_success_block, new_success_block, 1)

old_route = "app.get('/jobs/check-hired', handleCheckHiredJobs);"
new_route = """app.get('/jobs/check-hired', handleCheckHiredJobs);

async function handleScheduleStats(req, res) {
  try {
    const userId = getUserId(req);
    const stats = await require('./spendStore').getScheduleStats(userId);
    return send(res, 200, stats);
  } catch (err) {
    return send(res, 500, { error: err.message });
  }
}
app.get('/schedules/stats', handleScheduleStats);"""

if old_route not in c2:
    raise SystemExit("PATCH FAILED (6): check-hired route line not found")
c2 = c2.replace(old_route, new_route, 1)

with open(path2, "w") as f:
    f.write(c2)
print("✅ Patched src/server.js — scheduleId tagging on keeper success/failure, new GET /schedules/stats route")

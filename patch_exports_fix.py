#!/usr/bin/env python3

path = "src/spendStore.js"
with open(path) as f:
    content = f.read()

old = """module.exports = {
  appendSpend,
  appendSwap,
  appendFailure,
  appendInference,
  getJobsCreatedBy,
  getTodaySpend,
  getLastHourTxCount,
  getConsecutiveFailures,
  getHistory,
  trackUser,
  getActiveUsers
};"""

new = """async function getScheduleStats(userAddress) {
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
  getJobsCreatedBy,
  getTodaySpend,
  getLastHourTxCount,
  getConsecutiveFailures,
  getHistory,
  getScheduleStats,
  trackUser,
  getActiveUsers
};"""

if old not in content:
    raise SystemExit("PATCH FAILED: exports block not found")
content = content.replace(old, new, 1)

with open(path, "w") as f:
    f.write(content)

print("✅ Patched src/spendStore.js — getScheduleStats added")

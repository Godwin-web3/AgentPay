path = "src/server.js"

with open(path, "r") as f:
    content = f.read()

old = """app.get('/api/stats', (req, res) => {
  try {
    const fs = require('fs');
    const path = require('path');

    let spendLog = [];
    try { spendLog = JSON.parse(fs.readFileSync(path.join(__dirname, '../data/spendLog.json'), 'utf8')); } catch {}

    let schedules = { jobs: [] };
    try { schedules = JSON.parse(fs.readFileSync(path.join(__dirname, '../data/schedules.json'), 'utf8')); } catch {}

    Promise.resolve(walletStore.getAllWallets()).then(wallets => {
      const totalVolume = spendLog.reduce((sum, tx) => sum + parseFloat(tx.amount || 0), 0);
      const userCount = Object.keys(wallets).length;
      const txCount = spendLog.length;
      const activeSchedules = (schedules.jobs || []).filter(j => j.active).length;

      res.json({
        users: userCount,
        transactions: txCount,
        volume: totalVolume.toFixed(2),
        schedules: activeSchedules
      });
    }).catch(err => {
      res.status(500).json({ error: err.message });
    });
  } catch (err) {
    res.status(500).json({ error: err.message });"""

new = """app.get('/api/stats', (req, res) => {
  try {
    const { getHistory } = require('./spendStore');

    Promise.all([
      walletStore.getAllWallets(),
      getHistory(null, 5000)
    ]).then(([wallets, history]) => {
      const realTx = history.filter(tx => !tx.failed && tx.txHash);
      const totalVolume = realTx.reduce((sum, tx) => sum + parseFloat(tx.amount || 0), 0);
      const userCount = Object.keys(wallets).length;
      const txCount = realTx.length;
      const activeScheduleIds = new Set(
        realTx.filter(tx => tx.scheduleId).map(tx => tx.scheduleId)
      );

      res.json({
        users: userCount,
        transactions: txCount,
        volume: totalVolume.toFixed(2),
        schedules: activeScheduleIds.size
      });
    }).catch(err => {
      res.status(500).json({ error: err.message });
    });
  } catch (err) {
    res.status(500).json({ error: err.message });"""

if old not in content:
    print("MARKER NOT FOUND. Aborting, no changes made.")
    exit(1)

content = content.replace(old, new)

with open(path, "w") as f:
    f.write(content)

print("Patched: /api/stats now queries Firestore via spendStore.getHistory instead of local JSON.")

const fs = require('fs');
const path = require('path');
const { checkConditions } = require('./conditions');

const SCHEDULES_PATH = path.join(__dirname, '../data/schedules.json');

function ensureStore() {
  const dir = path.join(__dirname, '../data');
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  if (!fs.existsSync(SCHEDULES_PATH)) {
    fs.writeFileSync(SCHEDULES_PATH, JSON.stringify({ jobs: [] }, null, 2));
  }
}

function readSchedules() {
  ensureStore();
  return JSON.parse(fs.readFileSync(SCHEDULES_PATH, 'utf8'));
}

function writeSchedules(data) {
  ensureStore();
  fs.writeFileSync(SCHEDULES_PATH, JSON.stringify(data, null, 2));
}

function parseInterval(intervalStr) {
  if (!intervalStr) return null;
  const str = intervalStr.toLowerCase().trim();
  if (str.includes('second')) return (parseInt(str) || 30) * 1000;
  if (str.includes('minute')) return (parseInt(str) || 1) * 60 * 1000;
  if (str.includes('hour')) return (parseInt(str) || 1) * 60 * 60 * 1000;
  if (str.includes('day')) return (parseInt(str) || 1) * 24 * 60 * 60 * 1000;
  return null;
}

function intervalLabel(ms) {
  if (ms < 60000) return (ms / 1000) + ' seconds';
  if (ms < 3600000) return (ms / 60000) + ' minute(s)';
  if (ms < 86400000) return (ms / 3600000) + ' hour(s)';
  return (ms / 86400000) + ' day(s)';
}

function addJob({ to, amount, reason, intervalMs, intervalLabel: label, conditions }) {
  const store = readSchedules();
  const id = Date.now();
  const job = {
    id,
    to,
    amount,
    reason,
    intervalMs,
    intervalLabel: label,
    conditions: conditions || null,
    createdAt: new Date().toISOString(),
    lastRun: null,
    nextRun: new Date(Date.now() + intervalMs).toISOString(),
    totalRuns: 0,
    totalSpent: 0,
    active: true
  };
  store.jobs.push(job);
  writeSchedules(store);
  return job;
}

function cancelJob(id) {
  const store = readSchedules();
  const job = store.jobs.find(function(j) { return j.id === parseInt(id); });
  if (!job) return null;
  job.active = false;
  writeSchedules(store);
  return job;
}

function cancelAllJobs() {
  const store = readSchedules();
  store.jobs.forEach(function(j) { j.active = false; });
  writeSchedules(store);
}

function markExecuted(id) {
  const store = readSchedules();
  const job = store.jobs.find(function(j) { return j.id === id; });
  if (!job) return;
  if (job.conditions) job.conditions.executed = true;
  job.active = false;
  writeSchedules(store);
}

function updateJobAfterRun(id, success, amount) {
  const store = readSchedules();
  const job = store.jobs.find(function(j) { return j.id === id; });
  if (!job) return;
  job.lastRun = new Date().toISOString();
  job.nextRun = new Date(Date.now() + job.intervalMs).toISOString();
  job.totalRuns += 1;
  if (success) job.totalSpent += amount;
  writeSchedules(store);
}

function getActiveJobs() {
  return readSchedules().jobs.filter(function(j) { return j.active; });
}

function getAllJobs() {
  return readSchedules().jobs;
}

const timers = {};

function startJob(job, payFn, walletAddress) {
  if (timers[job.id]) return;

  console.log('\n⏰ Scheduled job started:');
  console.log('   ID:       ' + job.id);
  console.log('   To:       ' + job.to);
  console.log('   Amount:   ' + job.amount + ' STT');
  console.log('   Reason:   ' + job.reason);
  console.log('   Interval: every ' + job.intervalLabel);
  if (job.conditions) {
    console.log('   Conditions:');
    if (job.conditions.minBalance) console.log('     • Min balance: ' + job.conditions.minBalance + ' STT');
    if (job.conditions.executeAt) console.log('     • Execute at: ' + job.conditions.executeAt);
    if (job.conditions.executeOnDay) console.log('     • Execute on: ' + job.conditions.executeOnDay);
    if (job.conditions.executeOnDate) console.log('     • Execute on date: ' + job.conditions.executeOnDate);
    if (job.conditions.maxDailySpend) console.log('     • Max daily spend: ' + job.conditions.maxDailySpend + ' STT');
    if (job.conditions.executeOnce) console.log('     • One-time payment');
  }
  console.log('   Next check: ' + new Date(job.nextRun).toLocaleTimeString());

  timers[job.id] = setInterval(async function() {
    const store = readSchedules();
    const current = store.jobs.find(function(j) { return j.id === job.id; });

    if (!current || !current.active) {
      clearInterval(timers[job.id]);
      delete timers[job.id];
      return;
    }

    console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('⏰ Scheduled Job Checking — ID: ' + job.id);

    // Check conditions first
    const condResult = await checkConditions(current.conditions, walletAddress);

    if (!condResult.passed) {
      console.log('   ⏭️  Conditions not met — skipping this run');
      condResult.results.forEach(function(r) {
        if (!r.passed) console.log('   • ' + r.reason);
      });
      console.log('   Next check: ' + new Date(Date.now() + job.intervalMs).toLocaleTimeString());
      updateJobAfterRun(job.id, false, 0);
      console.log('\n💬 You: ');
      return;
    }

    console.log('   ✅ All conditions met — executing payment');
    condResult.results.forEach(function(r) {
      console.log('   • ' + r.reason);
    });

    try {
      const result = await payFn(job.to, job.amount, job.reason);
      if (result.success) {
        console.log('   💸 Executed | TX: ' + result.txHash.slice(0, 20) + '...');
        updateJobAfterRun(job.id, true, job.amount);

        // If one-time payment mark as done
        if (current.conditions && current.conditions.executeOnce) {
          markExecuted(job.id);
          clearInterval(timers[job.id]);
          delete timers[job.id];
          console.log('   ✅ One-time payment complete — job removed');
        }
      } else {
        console.log('   ❌ Blocked: ' + result.reason);
        updateJobAfterRun(job.id, false, 0);
      }
    } catch (err) {
      console.log('   ❌ Error: ' + err.message.slice(0, 60));
      updateJobAfterRun(job.id, false, 0);
    }

    console.log('   Next check: ' + new Date(Date.now() + job.intervalMs).toLocaleTimeString());
    console.log('\n💬 You: ');

  }, job.intervalMs);
}

function stopJob(id) {
  if (timers[id]) {
    clearInterval(timers[id]);
    delete timers[id];
  }
}

function stopAllJobs() {
  Object.keys(timers).forEach(function(id) {
    clearInterval(timers[id]);
    delete timers[id];
  });
}

module.exports = {
  ensureStore,
  readSchedules,
  writeSchedules,
  parseInterval,
  intervalLabel,
  addJob,
  cancelJob,
  cancelAllJobs,
  markExecuted,
  updateJobAfterRun,
  getActiveJobs,
  getAllJobs,
  startJob,
  stopJob,
  stopAllJobs
};


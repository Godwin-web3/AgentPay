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

function addJob({ to, amount, reason, intervalMs, intervalLabel: label, conditions, trigger, userAddress }) {
  const store = readSchedules();
  const id = Date.now();
  const job = {
    id,
    userAddress, // Added userAddress
    to,
    amount,
    reason,
    intervalMs,
    intervalLabel: label,
    conditions: conditions || null,
    trigger: trigger || null,
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

function cancelJob(id, userAddress) {
  const store = readSchedules();
  const job = store.jobs.find(j => j.id.toString() === id.toString());
  if (!job) return null;
  
  // Security check: only owner can cancel
  if (userAddress && job.userAddress && job.userAddress !== userAddress) {
    return null;
  }

  job.active = false;
  writeSchedules(store);
  return job;
}

function getAllJobs(userAddress) {
  const jobs = readSchedules().jobs;
  if (!userAddress) return jobs;
  return jobs.filter(j => !j.userAddress || j.userAddress === userAddress);
}

function getActiveJobs() {
  return readSchedules().jobs.filter(j => j.active);
}

// Note: The loop.js will use these to execute onchain
function stopAllJobs() {
  const store = readSchedules();
  store.jobs.forEach(j => { j.active = false; });
  writeSchedules(store);
}


const activeTimers = {};

async function startJob(job, payFn, ownerAddress) {
  if (activeTimers[job.id]) return;
  const userAddr = ownerAddress || job.userAddress;

  async function tick() {
    const store = readSchedules();
    const current = store.jobs.find(j => j.id === job.id);
    if (!current || !current.active) {
      clearInterval(activeTimers[job.id]);
      delete activeTimers[job.id];
      return;
    }

    if (new Date() < new Date(current.nextRun)) return;

    const check = await checkConditions(current.conditions, current);
    if (!check.passed) {
      console.log('\n⏳ Job ' + job.id + ' not ready: ' + check.results.map(r => r.reason).join(', '));
      return;
    }

    if (current.trigger) {
      console.log('\n⛓ Trigger verified on Somnia');
      console.log('   Type: ' + current.trigger.type + ' | condition met ✓');
    }

    console.log('\n🔄 Executing scheduled payment for ' + userAddr + '...');
    const result = await payFn(current.to, current.amount, current.reason, 'STT', userAddr);

    const s2 = readSchedules();
    const j2 = s2.jobs.find(j => j.id === job.id);
    j2.lastRun = new Date().toISOString();
    j2.nextRun = new Date(Date.now() + j2.intervalMs).toISOString();
    j2.totalRuns = (j2.totalRuns || 0) + 1;
    j2.totalSpent = (j2.totalSpent || 0) + j2.amount;
    if (j2.conditions && j2.conditions.executeOnce) j2.active = false;
    writeSchedules(s2);

    if (result && result.success) {
      console.log('✅ Scheduled payment: ' + current.amount + ' STT to ' + current.to);
    } else {
      console.log('❌ Payment failed: ' + (result && result.reason));
    }
  }

  activeTimers[job.id] = setInterval(tick, Math.min(job.intervalMs, 60000));
  console.log('⏰ Job ' + job.id + ' started, runs every ' + job.intervalLabel + ' for ' + userAddr);
}

function stopJob(id) {
  if (activeTimers[id]) {
    clearInterval(activeTimers[id]);
    delete activeTimers[id];
  }
}

module.exports = {
  readSchedules,
  writeSchedules,
  parseInterval,
  addJob,
  cancelJob,
  getAllJobs,
  getActiveJobs,
  stopAllJobs,
  startJob,
  stopJob
};

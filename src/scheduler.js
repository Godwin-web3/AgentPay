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
  const job = store.jobs.find(j => j.id.toString() === id.toString());
  if (!job) return null;
  job.active = false;
  writeSchedules(store);
  return job;
}

function getAllJobs() {
  return readSchedules().jobs;
}

function getActiveJobs() {
  return readSchedules().jobs.filter(j => j.active);
}

// Note: The loop.js will use these to execute onchain
module.exports = {
  readSchedules,
  writeSchedules,
  parseInterval,
  addJob,
  cancelJob,
  getAllJobs,
  getActiveJobs
};

// src/scheduler.js
// Firestore-backed replacement for data/schedules.json
// Each job is its own document in the `schedules` collection.
// Timer/execution logic is unchanged — only the read/write layer moved.

const { initializeApp, getApps, cert } = require('firebase-admin/app');
const { getFirestore } = require('firebase-admin/firestore');
const { evaluateTrigger } = require('./triggers');
const { checkConditions } = require('./conditions');

if (!getApps().length) {
  initializeApp({
    credential: cert({
      projectId: process.env.FIREBASE_PROJECT_ID,
      clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
      privateKey: process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, '\n'),
    }),
  });
}

const db = getFirestore();
const COLLECTION = 'schedules';

async function readSchedules() {
  const snapshot = await db.collection(COLLECTION).get();
  return snapshot.docs.map(doc => doc.data());
}

async function writeJob(job) {
  await db.collection(COLLECTION).doc(job.id.toString()).set(job);
}

async function patchJob(id, updates) {
  await db.collection(COLLECTION).doc(id.toString()).update(updates);
}

function parseInterval(intervalStr) {
  if (!intervalStr) return null;
  const str = intervalStr.toLowerCase().trim();
  if (str.includes('second')) return (parseInt(str) || 30) * 1000;
  if (str.includes('minute')) return (parseInt(str) || 1) * 60 * 1000;
  if (str.includes('hour'))   return (parseInt(str) || 1) * 60 * 60 * 1000;
  if (str.includes('day'))    return (parseInt(str) || 1) * 24 * 60 * 60 * 1000;
  return null;
}

async function addJob({ to, amount, reason, intervalMs, intervalLabel: label, conditions, trigger, userAddress }) {
  const id = Date.now();
  const job = {
    id,
    userAddress: userAddress || null,
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
  await writeJob(job);
  return job;
}

async function cancelJob(id, userAddress) {
  const ref = db.collection(COLLECTION).doc(id.toString());
  const doc = await ref.get();
  if (!doc.exists) return null;
  const job = doc.data();
  if (userAddress && job.userAddress && job.userAddress !== userAddress) return null;
  await ref.update({ active: false });
  return { ...job, active: false };
}

async function getAllJobs(userAddress) {
  let query = db.collection(COLLECTION).orderBy('createdAt', 'desc');
  if (userAddress) query = db.collection(COLLECTION)
    .where('userAddress', '==', userAddress)
    .orderBy('createdAt', 'desc');
  const snapshot = await query.get();
  return snapshot.docs.map(doc => doc.data());
}

async function getActiveJobs() {
  const snapshot = await db.collection(COLLECTION)
    .where('active', '==', true)
    .get();
  return snapshot.docs.map(doc => doc.data());
}

const activeTimers = {};

async function startJob(job, payFn, ownerAddress) {
  if (activeTimers[job.id]) return;
  const userAddr = ownerAddress || job.userAddress;

  async function tick() {
    const doc = await db.collection(COLLECTION).doc(job.id.toString()).get();
    if (!doc.exists) return;
    const current = doc.data();
    if (!current.active) {
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

    let triggerResult = null;
    if (current.trigger) {
      console.log('\n⛓ Evaluating trigger condition on Arc...');
      triggerResult = await evaluateTrigger(current.trigger, { privateKey: process.env.PRIVATE_KEY });
      if (!triggerResult.met) {
        console.log('   ⏳ Trigger not met, skipping.');
        return;
      }
      console.log('   ✅ Trigger met. Proof: ' + (triggerResult.proof || 'n/a'));
    }

    console.log('\n🔄 Executing scheduled payment for ' + userAddr + '...');
    const result = await payFn(current.to, current.amount, current.reason, 'USDC', userAddr, {
      isScheduled: true,
      triggerProof: current.trigger ? triggerResult.proof : null
    });

    const now = new Date().toISOString();
    const updates = {
      lastRun: now,
      nextRun: new Date(Date.now() + current.intervalMs).toISOString(),
      totalRuns: (current.totalRuns || 0) + 1,
      totalSpent: (current.totalSpent || 0) + current.amount,
    };
    if (current.conditions && current.conditions.executeOnce) updates.active = false;
    await patchJob(job.id, updates);

    if (result && result.success) {
      console.log('✅ Scheduled payment: ' + current.amount + ' USDC to ' + current.to +
        (result.txHash ? '\n   🔗 Tx: https://testnet.arcscan.app/tx/' + result.txHash : ''));
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

function stopAllJobs() {
  Object.keys(activeTimers).forEach(id => {
    clearInterval(activeTimers[id]);
    delete activeTimers[id];
  });
  console.log('🛑 All scheduled jobs stopped.');
}

function intervalLabel(ms) {
  const seconds = ms / 1000;
  const minutes = seconds / 60;
  const hours = minutes / 60;
  const days = hours / 24;
  if (days >= 1)    return Math.round(days) + ' day(s)';
  if (hours >= 1)   return Math.round(hours) + ' hour(s)';
  if (minutes >= 1) return Math.round(minutes) + ' minute(s)';
  return Math.round(seconds) + ' second(s)';
}

module.exports = {
  readSchedules,
  parseInterval,
  addJob,
  cancelJob,
  getAllJobs,
  getActiveJobs,
  stopAllJobs,
  startJob,
  stopJob,
  intervalLabel
};

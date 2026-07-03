// src/spendStore.js
// Firestore-backed replacement for the old data/spendLog.json file.
// Each spend/failure/swap/inference record is its own document in the
// `spends` collection, queryable by userAddress and timestamp. This removes
// the same file-wiped-on-redeploy problem that motivated the wallet and
// chat history migrations.

const { initializeApp, getApps, cert } = require('firebase-admin/app');
const { getFirestore } = require('firebase-admin/firestore');

// Self-contained init — does not assume walletStore.js has already run
// initializeApp(). Require order across files (agent.js, server.js) isn't
// guaranteed, so each store module must be able to initialize Firebase on
// its own, guarded so it only runs once per process.
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
const COLLECTION = 'spends';
const USERS_COLLECTION = 'activeUsers';

async function appendSpend({ userAddress, to, amount, reason, txHash, agentId, jobId, scheduleId, token, isScheduled, triggerProof, type, deliverableText }) {
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
    deliverableText: deliverableText || null,
    timestamp: Date.now(),
    date: new Date().toDateString()
  });
}

async function appendFailure({ userAddress, to, amount, reason, blockedReason, agentId, scheduleId }) {
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
}

async function appendSwap({ userAddress, fromToken, toToken, amount, txHash }) {
  await db.collection(COLLECTION).add({
    userAddress,
    type: 'swap',
    fromToken,
    toToken,
    amount,
    txHash,
    timestamp: Date.now(),
    date: new Date().toDateString()
  });
}

async function appendInference({ userAddress, message, response, requestId, verifiable }) {
  await db.collection(COLLECTION).add({
    userAddress,
    type: 'inference',
    message,
    response,
    requestId,
    verifiable: !!verifiable,
    timestamp: Date.now(),
    date: new Date().toDateString()
  });
}

async function getTodaySpend(userAddress) {
  const today = new Date().toDateString();
  let query = db.collection(COLLECTION).where('date', '==', today);
  if (userAddress) query = query.where('userAddress', '==', userAddress);
  const snapshot = await query.get();
  let sum = 0;
  snapshot.forEach(doc => {
    const s = doc.data();
    if (!s.failed) sum += s.amount;
  });
  return sum;
}

async function getLastHourTxCount(userAddress) {
  const oneHourAgo = Date.now() - 60 * 60 * 1000;
  let query = db.collection(COLLECTION).where('timestamp', '>', oneHourAgo);
  if (userAddress) query = query.where('userAddress', '==', userAddress);
  const snapshot = await query.get();
  let count = 0;
  snapshot.forEach(doc => { if (!doc.data().failed) count++; });
  return count;
}

async function getConsecutiveFailures(userAddress) {
  // Needs most-recent-first order to walk back until a non-failure breaks the streak.
  let query = db.collection(COLLECTION).orderBy('timestamp', 'desc').limit(50);
  if (userAddress) query = db.collection(COLLECTION).where('userAddress', '==', userAddress).orderBy('timestamp', 'desc').limit(50);
  const snapshot = await query.get();
  let count = 0;
  for (const doc of snapshot.docs) {
    const s = doc.data();
    if (s.failed) count++;
    else break;
  }
  return count;
}

async function getHistory(userAddress, limit) {
  limit = limit || 50;
  let query = db.collection(COLLECTION).orderBy('timestamp', 'desc').limit(limit);
  if (userAddress) {
    query = db.collection(COLLECTION)
      .where('userAddress', '==', userAddress)
      .orderBy('timestamp', 'desc')
      .limit(limit);
  }
  const snapshot = await query.get();
  return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
}

async function trackUser(userAddress) {
  if (!userAddress || userAddress === 'anonymous') return;
  await db.collection(USERS_COLLECTION).doc(userAddress).set({ address: userAddress, lastSeen: Date.now() }, { merge: true });
}

async function getActiveUsers() {
  const snapshot = await db.collection(USERS_COLLECTION).get();
  return snapshot.docs.map(doc => doc.data().address);
}

async function getJobsCreatedBy(userAddress) {
  const snap = await db.collection(COLLECTION)
    .where('userAddress', '==', userAddress)
    .where('type', '==', 'job_hire')
    .get();
  return snap.docs.map(doc => doc.data().jobId).filter(Boolean);
}

async function getScheduleStats(userAddress) {
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
};

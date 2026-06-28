// src/spendStore.js
// Firestore-backed replacement for the old data/spendLog.json file.
// Each spend/failure/swap/inference record is its own document in the
// `spends` collection, queryable by userAddress and timestamp. This removes
// the same file-wiped-on-redeploy problem that motivated the wallet and
// chat history migrations.

const { getFirestore } = require('firebase-admin/firestore');

// Reuses the firebase-admin app already initialized by walletStore.js
// (server.js always requires walletStore.js before this file).
const db = getFirestore();
const COLLECTION = 'spends';
const USERS_COLLECTION = 'activeUsers';

async function appendSpend({ userAddress, to, amount, reason, txHash, agentId, token, isScheduled, triggerProof, type }) {
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
}

async function appendFailure({ userAddress, to, amount, reason, blockedReason, agentId }) {
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
  const addr = userAddress.toLowerCase();
  await db.collection(USERS_COLLECTION).doc(addr).set({ address: addr, lastSeen: Date.now() }, { merge: true });
}

async function getActiveUsers() {
  const snapshot = await db.collection(USERS_COLLECTION).get();
  return snapshot.docs.map(doc => doc.data().address);
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
  trackUser,
  getActiveUsers
};

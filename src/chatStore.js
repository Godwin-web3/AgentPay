// src/chatStore.js
// Firestore-backed replacement for the old in-memory chatHistories Map.
// Each user's chat history is its own document at: chatHistories/{uid}
// This removes the volatility problem where chat history was wiped on
// every backend restart/redeploy (same root cause the wallet migration fixed).

const { getFirestore } = require('firebase-admin/firestore');

// Reuses the firebase-admin app already initialized by walletStore.js
// (initializeApp can only run once per process; walletStore.js is always
// required before this in server.js, so getApps().length > 0 by this point).
const db = getFirestore();
const COLLECTION = 'chatHistories';

/**
 * Get one user's chat history array by uid.
 * Returns [] if not found (mirrors old `chatHistories.get(userId) || []` behavior).
 */
async function getChatHistory(uid) {
  const doc = await db.collection(COLLECTION).doc(uid).get();
  return doc.exists ? (doc.data().history || []) : [];
}

/**
 * Overwrite a user's chat history array.
 */
async function setChatHistory(uid, history) {
  await db.collection(COLLECTION).doc(uid).set({ history, updatedAt: Date.now() });
  return history;
}

/**
 * Delete a user's chat history (mirrors old chatHistories.delete(userId)).
 */
async function deleteChatHistory(uid) {
  await db.collection(COLLECTION).doc(uid).delete();
}

module.exports = { getChatHistory, setChatHistory, deleteChatHistory };

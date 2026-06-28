// src/chatStore.js
// Firestore-backed replacement for the old in-memory chatHistories Map.
// Each user's chat history is its own document at: chatHistories/{uid}
// This removes the volatility problem where chat history was wiped on
// every backend restart/redeploy (same root cause the wallet migration fixed).

const { initializeApp, getApps, cert } = require('firebase-admin/app');
const { getFirestore } = require('firebase-admin/firestore');

// Self-contained init — does not assume walletStore.js has already run
// initializeApp(). Require order across files isn't guaranteed, so each
// store module must be able to initialize Firebase on its own, guarded so
// it only runs once per process.
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

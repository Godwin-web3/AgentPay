// src/walletStore.js
// Firestore-backed replacement for the old userWallets.json file.
// Each user's wallet record is its own document at: wallets/{uid}
// This removes the read-whole-file -> mutate -> write-whole-file race
// that caused data loss when concurrent requests both called saveWallets().

const { initializeApp, getApps, cert } = require('firebase-admin/app');
const { getFirestore } = require('firebase-admin/firestore');

if (!getApps().length) {
  initializeApp({
    credential: cert({
      projectId: process.env.FIREBASE_PROJECT_ID,
      clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
      // .env stores literal \n escapes inside a quoted string; convert back to real newlines.
      privateKey: process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, '\n'),
    }),
  });
}

const db = getFirestore();
const COLLECTION = 'wallets';

/**
 * Get one user's wallet record by uid.
 * Returns null if not found (mirrors old `wallets[uid] === undefined` behavior).
 */
async function getWallet(uid) {
  const doc = await db.collection(COLLECTION).doc(uid).get();
  return doc.exists ? doc.data() : null;
}

/**
 * Create or overwrite a user's wallet record.
 * `data` shape matches what server.js already builds, e.g.
 * { walletId, address, email, displayName, tag, createdAt }
 */
async function setWallet(uid, data) {
  await db.collection(COLLECTION).doc(uid).set(data, { merge: true });
  return data;
}

/**
 * Get every wallet record as a { uid: data, ... } object —
 * matches the old `JSON.parse(readFileSync(...))` shape so call sites
 * (e.g. /api/stats, tag lookups) need minimal changes.
 */
async function getAllWallets() {
  const snapshot = await db.collection(COLLECTION).get();
  const wallets = {};
  snapshot.forEach(doc => {
    wallets[doc.id] = doc.data();
  });
  return wallets;
}

/**
 * Find a wallet record by its claimed @tag. Returns { uid, ...data } or null.
 */
async function findByTag(tag) {
  const snapshot = await db.collection(COLLECTION).where('tag', '==', tag).limit(1).get();
  if (snapshot.empty) return null;
  const doc = snapshot.docs[0];
  return { uid: doc.id, ...doc.data() };
}

module.exports = { getWallet, setWallet, getAllWallets, findByTag };

// src/intentStore.js — Firestore persistence for intent solver plans.
// Mirrors src/scheduler.js's collection-per-document pattern for schedules.

const { initializeApp, getApps, cert } = require('firebase-admin/app');
const { getFirestore } = require('firebase-admin/firestore');

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
const COLLECTION = 'intents';

async function createIntent(doc) {
  await db.collection(COLLECTION).doc(doc.id).set(doc);
  return doc;
}

async function getIntent(id) {
  const snap = await db.collection(COLLECTION).doc(id).get();
  return snap.exists ? snap.data() : null;
}

async function saveIntent(doc) {
  await db.collection(COLLECTION).doc(doc.id).set(doc);
  return doc;
}

async function listIntents(userAddress) {
  let query = db.collection(COLLECTION).orderBy('createdAt', 'desc');
  if (userAddress) {
    query = db.collection(COLLECTION).where('userAddress', '==', userAddress).orderBy('createdAt', 'desc');
  }
  const snap = await query.get();
  return snap.docs.map((d) => d.data());
}

async function listActiveIntents() {
  const snap = await db.collection(COLLECTION).where('status', '==', 'active').get();
  return snap.docs.map((d) => d.data());
}

module.exports = { createIntent, getIntent, saveIntent, listIntents, listActiveIntents };

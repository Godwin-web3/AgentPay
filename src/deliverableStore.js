// src/deliverableStore.js — off-chain content channel between two
// independent AgentPay deployments doing business over the shared ERC-8183
// job escrow.
//
// The escrow contract's submit() only accepts a bytes32 hash of the
// deliverable (see src/jobService.js submitDeliverable) — the full text
// never goes on-chain. When client and provider are the SAME backend, the
// text already travels via spendStore (see agent.js completeHiredJob). When
// they're two SEPARATE AgentPay operators, the provider's daemon pushes the
// real text here via POST /agent/deliver so the client/evaluator's own
// daemon can read it and decide whether to complete or reject the job.

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
const COLLECTION = 'deliverables';

async function putDeliverable(jobId, { deliverableText, providerAddress }) {
  const doc = {
    jobId: String(jobId),
    deliverableText,
    providerAddress,
    receivedAt: new Date().toISOString(),
  };
  await db.collection(COLLECTION).doc(String(jobId)).set(doc);
  return doc;
}

async function getDeliverable(jobId) {
  const snap = await db.collection(COLLECTION).doc(String(jobId)).get();
  return snap.exists ? snap.data() : null;
}

module.exports = { putDeliverable, getDeliverable };

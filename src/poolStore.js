// src/poolStore.js — off-chain mirrors for PoolVault, Firestore-backed.
// PoolVault.sol is the source of truth for everything that matters
// (balances, membership status, proposal outcomes); these collections only
// exist to make "list my pools" and "which proposals still need resolving"
// fast without scanning on-chain state for every pool. Mirrors the pattern
// already used by src/scheduler.js / src/intentStore.js.

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
const POOLS = 'pools';
const PROPOSALS = 'poolProposals';
const MESSAGES = 'poolMessages';

async function createPoolMeta({ poolId, name, founderAddress, memberAddresses }) {
  const doc = {
    poolId: String(poolId),
    name,
    founderAddress,
    memberAddresses: memberAddresses.map((a) => a.toLowerCase()),
    createdAt: new Date().toISOString(),
  };
  await db.collection(POOLS).doc(String(poolId)).set(doc);
  return doc;
}

async function addMemberToPoolMeta(poolId, address) {
  const ref = db.collection(POOLS).doc(String(poolId));
  const snap = await ref.get();
  if (!snap.exists) return;
  const data = snap.data();
  const addr = address.toLowerCase();
  if (!data.memberAddresses.includes(addr)) {
    await ref.update({ memberAddresses: [...data.memberAddresses, addr] });
  }
}

async function getPoolMeta(poolId) {
  const snap = await db.collection(POOLS).doc(String(poolId)).get();
  return snap.exists ? snap.data() : null;
}

async function listPoolsForMember(address) {
  const snap = await db.collection(POOLS).where('memberAddresses', 'array-contains', address.toLowerCase()).get();
  return snap.docs.map((d) => d.data());
}

async function recordProposal({ proposalId, poolId, kind, windowEnds, proposer }) {
  const doc = {
    proposalId: String(proposalId),
    poolId: String(poolId),
    kind,
    windowEnds,
    proposer: proposer || null,
    closed: false,
    createdAt: new Date().toISOString(),
  };
  await db.collection(PROPOSALS).doc(String(proposalId)).set(doc);
  return doc;
}

async function closeProposal(proposalId, outcome) {
  await db.collection(PROPOSALS).doc(String(proposalId)).update({ closed: true, outcome, closedAt: new Date().toISOString() });
}

async function listProposalsForPool(poolId) {
  // Sort client-side rather than combining where()+orderBy() on different
  // fields — that combination needs a composite Firestore index to exist,
  // and a brand-new pool would just throw here (Firestore's error surfaces
  // as a generic 500, easy to mistake for something else entirely broken).
  const snap = await db.collection(PROPOSALS).where('poolId', '==', String(poolId)).get();
  return snap.docs.map((d) => d.data()).sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
}

async function listPendingProposals() {
  const snap = await db.collection(PROPOSALS).where('closed', '==', false).get();
  return snap.docs.map((d) => d.data());
}

// ── Pool group chat ──────────────────────────────────────────────────────
// Every member of a pool sees the same thread — this is not per-user chat
// history like the personal Terminal's chatStore.js.

async function appendPoolMessage({ poolId, role, authorAddress, content, proposalId, messageType }) {
  const doc = {
    poolId: String(poolId),
    role, // 'user' | 'assistant' | 'system'
    authorAddress: authorAddress || null,
    content,
    proposalId: proposalId || null,
    messageType: messageType || 'text', // 'text' | 'proposal' | 'system'
    timestamp: new Date().toISOString(),
  };
  const ref = await db.collection(MESSAGES).add(doc);
  return { id: ref.id, ...doc };
}

async function listPoolMessages(poolId, limit = 100) {
  const snap = await db.collection(MESSAGES).where('poolId', '==', String(poolId)).get();
  return snap.docs
    .map((d) => ({ id: d.id, ...d.data() }))
    .sort((a, b) => (a.timestamp < b.timestamp ? -1 : 1))
    .slice(-limit);
}

module.exports = {
  createPoolMeta,
  addMemberToPoolMeta,
  getPoolMeta,
  listPoolsForMember,
  appendPoolMessage,
  listPoolMessages,
  recordProposal,
  closeProposal,
  listProposalsForPool,
  listPendingProposals,
};

// Remembers vault and swap-executor addresses.
// Memory covers this process. Firestore survives a Render restart,
// so a boot deploy does not run a second time.

const memory = {};

function remember(chainKey, record) {
  memory[chainKey] = { ...memory[chainKey], ...record };
  return memory[chainKey];
}

function recall(chainKey) {
  return memory[chainKey] || null;
}

function firebaseReady() {
  return !!(process.env.FIREBASE_PROJECT_ID && process.env.FIREBASE_CLIENT_EMAIL && process.env.FIREBASE_PRIVATE_KEY);
}

function firestore() {
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
  return getFirestore();
}

async function load(chainKey) {
  if (!firebaseReady()) return recall(chainKey);
  const doc = await firestore().collection('chainDeployments').doc(chainKey).get();
  if (!doc.exists) return recall(chainKey);
  return remember(chainKey, doc.data());
}

async function save(chainKey, record) {
  const next = remember(chainKey, record);
  if (firebaseReady()) {
    await firestore().collection('chainDeployments').doc(chainKey).set(next, { merge: true });
  }
  return next;
}

// Another instance may boot at the same time. Only one may deploy.
function decideClaim(existing, now) {
  if (existing && existing.status === 'deployed' && existing.vault && (existing.executor || existing.executorSkipped)) {
    return { won: false, record: existing };
  }
  if (existing && existing.status === 'deploying' && now - Number(existing.startedAt || 0) < 20 * 60 * 1000) {
    return { won: false, record: existing };
  }
  return { won: true };
}

async function claim(chainKey) {
  const now = Date.now();
  if (!firebaseReady()) {
    const decision = decideClaim(recall(chainKey), now);
    if (!decision.won) return decision;
    const record = remember(chainKey, { status: 'deploying', startedAt: now });
    return { won: true, record };
  }
  const ref = firestore().collection('chainDeployments').doc(chainKey);
  return firestore().runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    const existing = snap.exists ? snap.data() : null;
    const decision = decideClaim(existing, now);
    if (!decision.won) {
      remember(chainKey, decision.record);
      return decision;
    }
    const record = { ...(existing || {}), status: 'deploying', startedAt: now };
    tx.set(ref, record, { merge: true });
    remember(chainKey, record);
    return { won: true, record };
  });
}

module.exports = {
  remember,
  recall,
  load,
  save,
  claim,
  decideClaim,
  firebaseReady,
};

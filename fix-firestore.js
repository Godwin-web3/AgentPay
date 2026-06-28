require('dotenv').config();
const { initializeApp, cert } = require('firebase-admin/app');
const { getFirestore } = require('firebase-admin/firestore');
initializeApp({ credential: cert({
  projectId: process.env.FIREBASE_PROJECT_ID,
  clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
  privateKey: process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, '\n')
})});
const db = getFirestore();
Promise.all([
  db.collection('wallets').doc('0x9c45b73b3aa2365ef56bb15735f9c22cd1ba4de0').delete(),
  db.collection('wallets').doc('anonymous').delete(),
]).then(() => { console.log('Cleaned'); process.exit(0); })
  .catch(e => { console.error(e.message); process.exit(1); });

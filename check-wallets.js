require('dotenv').config();
const { initializeApp, cert } = require('firebase-admin/app');
const { getFirestore } = require('firebase-admin/firestore');
initializeApp({ credential: cert({
  projectId: process.env.FIREBASE_PROJECT_ID,
  clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
  privateKey: process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, '\n')
})});
const db = getFirestore();
db.collection('wallets').get().then(snap => {
  snap.forEach(doc => console.log(doc.id, doc.data().address, doc.data().tag));
  process.exit(0);
}).catch(e => { console.error(e.message); process.exit(1); });

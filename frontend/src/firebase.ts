import { initializeApp } from 'firebase/app';
import { getAuth, GoogleAuthProvider } from 'firebase/auth';

const firebaseConfig = {
  apiKey: "AIzaSyATKTsEopIykqHg99k48OyZPLbdpSLkpyw",
  authDomain: "agentpay-74270.firebaseapp.com",
  projectId: "agentpay-74270",
  storageBucket: "agentpay-74270.firebasestorage.app",
  messagingSenderId: "743808320286",
  appId: "1:743808320286:web:762aa7804ff6e687d4ff0f"
};

const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const googleProvider = new GoogleAuthProvider();

import { createContext, useContext, useEffect, useState } from 'react';
import type { ReactNode } from 'react';
import { usePrivy } from '@privy-io/react-auth';

interface AuthUser {
  uid: string;
}

interface AuthContextType {
  user: AuthUser | null;
  loading: boolean;
  walletAddress: string;
  uid: string;
  signInWithGoogle: () => Promise<void>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | null>(null);

function embeddedAddress(user: ReturnType<typeof usePrivy>['user']) {
  if (!user) return '';
  const direct = user.wallet?.address;
  if (direct) return direct;
  const linked = user.linkedAccounts?.find((account) => account.type === 'wallet' && 'address' in account && account.address);
  return linked && 'address' in linked ? linked.address : '';
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const { ready, authenticated, user: privyUser, login, logout: privyLogout } = usePrivy();
  const [user, setUser] = useState<AuthUser | null>(null);
  const [booting, setBooting] = useState(true);
  const [walletAddress, setWalletAddress] = useState('');
  const [uid, setUid] = useState('');

  useEffect(() => {
    const timer = setTimeout(() => setBooting(false), 6000);
    return () => clearTimeout(timer);
  }, [ready, authenticated]);

  useEffect(() => {
    if (!ready) return;
    if (!authenticated || !privyUser) {
      setUser(null);
      setUid('');
      setWalletAddress('');
      setBooting(false);
      return;
    }

    const address = embeddedAddress(privyUser);
    if (!address) return;

    setUser({ uid: privyUser.id });
    setUid(privyUser.id);
    setWalletAddress(address);
    localStorage.setItem('agentpay_address', address);
    localStorage.setItem('agentpay_uid', privyUser.id);
    setBooting(false);

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 8000);
    fetch('https://agentpay-c4o7.onrender.com/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      signal: controller.signal,
      body: JSON.stringify({
        uid: privyUser.id,
        email: privyUser.email?.address || privyUser.google?.email || null,
        displayName: privyUser.google?.name || null,
        address,
      }),
    })
      .then((res) => res.json())
      .then((data) => {
        const saved = data.wallet?.address || address;
        if (!saved || saved === address) return;
        setWalletAddress(saved);
        localStorage.setItem('agentpay_address', saved);
      })
      .catch(() => {})
      .finally(() => clearTimeout(timer));

    return () => {
      controller.abort();
      clearTimeout(timer);
    };
  }, [ready, authenticated, privyUser]);

  const signInWithGoogle = async () => {
    login();
  };

  const logout = async () => {
    await privyLogout();
    setUser(null);
    setUid('');
    setWalletAddress('');
    localStorage.removeItem('agentpay_address');
    localStorage.removeItem('agentpay_uid');
  };

  return (
    <AuthContext.Provider value={{ user, loading: booting, walletAddress, uid, signInWithGoogle, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider');
  return ctx;
}

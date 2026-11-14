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
  const [loading, setLoading] = useState(true);
  const [walletAddress, setWalletAddress] = useState('');
  const [uid, setUid] = useState('');

  useEffect(() => {
    if (!ready) return;
    const address = embeddedAddress(privyUser);
    if (!authenticated || !privyUser || !address) {
      setUser(null);
      setUid('');
      setWalletAddress('');
      setLoading(!authenticated || !privyUser);
      return;
    }

    let cancelled = false;
    setLoading(true);
    fetch('https://agentpay-c4o7.onrender.com/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        uid: privyUser.id,
        email: privyUser.email?.address || privyUser.google?.email || null,
        displayName: privyUser.google?.name || null,
        address,
      }),
    })
      .then((res) => res.json())
      .then((data) => {
        if (cancelled) return;
        const saved = data.wallet?.address || address;
        setUser({ uid: privyUser.id });
        setUid(privyUser.id);
        setWalletAddress(saved);
        localStorage.setItem('agentpay_address', saved);
        localStorage.setItem('agentpay_uid', privyUser.id);
      })
      .catch((err) => {
        console.error('Backend login sync failed:', err);
        if (cancelled) return;
        setUser({ uid: privyUser.id });
        setUid(privyUser.id);
        setWalletAddress(address);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [ready, authenticated, privyUser]);

  const signInWithGoogle = async () => {
    login();
  };

  const logout = async () => {
    await privyLogout();
    localStorage.removeItem('agentpay_address');
    localStorage.removeItem('agentpay_uid');
  };

  return (
    <AuthContext.Provider value={{ user, loading: !ready || loading, walletAddress, uid, signInWithGoogle, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider');
  return ctx;
}

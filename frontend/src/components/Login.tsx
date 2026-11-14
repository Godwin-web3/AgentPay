import { useAuth } from '../contexts/AuthContext';
import { Wordmark } from './Mark';

export default function Login({ onBack }: { onBack?: () => void }) {
  const { signInWithGoogle } = useAuth();

  return (
    <div className="sheet">
      <header className="sheet-bar">
        {onBack ? (
          <button type="button" onClick={onBack} className="text-link">Back</button>
        ) : <Wordmark />}
        <span className="kicker" style={{ margin: 0 }}>Sign in</span>
      </header>
      <main className="sheet-main">
        <h1 className="display display-tight">
          Your wallet
          <span className="display-em">follows Google.</span>
        </h1>
        <p className="lede">
          A new account gets one address. That address is used on Robinhood, Base, and Arc.
        </p>
        <button type="button" onClick={signInWithGoogle} className="ink-btn">
          Continue with Google
        </button>
        <p className="fine">No seed phrase. You confirm every send in this session.</p>
      </main>
    </div>
  );
}

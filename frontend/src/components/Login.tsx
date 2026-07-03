import { useAuth } from '../contexts/AuthContext';

export default function Login({ onBack }: { onBack?: () => void }) {
  const { signInWithGoogle } = useAuth();

  return (
    <div style={{
      position: 'relative',
      minHeight: '100vh',
      background: '#0B0D10',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      gap: '32px',
      padding: '24px',
      fontFamily: 'var(--font-mono)',
    }}>
      {onBack && (
        <button onClick={onBack} style={{
          position: 'absolute',
          top: 20,
          left: 20,
          background: 'transparent',
          border: 'none',
          color: '#444',
          fontSize: 11,
          letterSpacing: 1,
          cursor: 'pointer',
        }}>
          ← BACK
        </button>
      )}

      <div style={{ textAlign: 'center' }}>
        <span style={{ fontSize: 14, fontWeight: 700, letterSpacing: 3, color: 'var(--text)' }}>AGENTPAY</span>
        <p style={{ color: '#666', marginTop: '10px', fontSize: '13px' }}>
          Autonomous USDC payments powered by AI
        </p>
      </div>

      <div style={{
        background: '#141414',
        border: '1px solid #222',
        padding: '32px',
        width: '100%',
        maxWidth: '360px',
        display: 'flex',
        flexDirection: 'column',
        gap: '14px'
      }}>
        <p style={{ color: '#fff', fontSize: '15px', fontWeight: 600, margin: 0 }}>Sign in</p>
        <p style={{ color: '#666', fontSize: '12px', margin: 0, lineHeight: 1.6 }}>
          Returning user. Your Circle wallet loads automatically.
        </p>
        <button
          onClick={signInWithGoogle}
          style={{
            background: 'var(--seal)',
            color: '#0B0D10',
            border: 'none',
            padding: '13px',
            fontSize: '13px',
            fontWeight: 700,
            letterSpacing: 1,
            cursor: 'pointer',
            fontFamily: 'var(--font-mono)',
          }}
        >
          CONTINUE WITH GOOGLE
        </button>

        <div style={{ height: 1, background: '#222', margin: '4px 0' }} />

        <p style={{ color: '#fff', fontSize: '15px', fontWeight: 600, margin: 0 }}>New here</p>
        <p style={{ color: '#666', fontSize: '12px', margin: 0, lineHeight: 1.6 }}>
          A wallet is created for you on sign up. No seed phrases, no gas.
        </p>
        <button
          onClick={signInWithGoogle}
          style={{
            background: 'transparent',
            color: 'var(--seal)',
            border: '1px solid var(--seal)',
            padding: '13px',
            fontSize: '13px',
            fontWeight: 700,
            letterSpacing: 1,
            cursor: 'pointer',
            fontFamily: 'var(--font-mono)',
          }}
        >
          SIGN UP WITH GOOGLE
        </button>
      </div>

      <p style={{ color: '#444', fontSize: '11px', textAlign: 'center' }}>
        Your wallet is tied to your Google account.
      </p>
    </div>
  );
}

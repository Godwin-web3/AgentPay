import { useAuth } from '../contexts/AuthContext';

export default function Login() {
  const { signInWithGoogle } = useAuth();

  return (
    <div style={{
      minHeight: '100vh',
      background: '#0A0A0A',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      gap: '32px',
      padding: '24px'
    }}>
      <div style={{ textAlign: 'center' }}>
        <div style={{ fontSize: '48px', marginBottom: '8px' }}>⚡</div>
        <h1 style={{ color: '#4fdbc8', fontSize: '28px', fontWeight: 700, margin: 0 }}>AgentPay</h1>
        <p style={{ color: '#666', marginTop: '8px', fontSize: '14px' }}>
          Autonomous USDC payments powered by AI
        </p>
      </div>

      <div style={{
        background: '#141414',
        border: '1px solid #222',
        borderRadius: '4px',
        padding: '32px',
        width: '100%',
        maxWidth: '360px',
        display: 'flex',
        flexDirection: 'column',
        gap: '16px'
      }}>
        <p style={{ color: '#fff', fontSize: '16px', fontWeight: 600, margin: 0 }}>
          Sign in to get started
        </p>
        <p style={{ color: '#666', fontSize: '13px', margin: 0 }}>
          A Circle wallet is created for you automatically. No seed phrases.
        </p>
        <button
          onClick={signInWithGoogle}
          style={{
            background: '#4fdbc8',
            color: '#0A0A0A',
            border: 'none',
            borderRadius: '4px',
            padding: '14px',
            fontSize: '15px',
            fontWeight: 700,
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '8px'
          }}
        >
          <span>G</span> Continue with Google
        </button>
      </div>

      <p style={{ color: '#444', fontSize: '12px', textAlign: 'center' }}>
        Your wallet is tied to your Google account. Pick a tag after sign in.
      </p>
    </div>
  );
}

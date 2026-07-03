import sys

def patch(path, old, new, label):
    with open(path, 'r') as f:
        content = f.read()
    if old not in content:
        print(f"ABORT: pattern not found for {label} in {path}")
        sys.exit(1)
    if content.count(old) > 1:
        print(f"ABORT: pattern not unique for {label} in {path}")
        sys.exit(1)
    content = content.replace(old, new)
    with open(path, 'w') as f:
        f.write(content)
    print(f"OK: patched {label} in {path}")

patch(
    'frontend/src/App.tsx',
    "import Onboarding from './views/Onboarding'",
    "import Onboarding from './views/Onboarding'\nimport Login from './components/Login'",
    "Login import"
)

patch(
    'frontend/src/App.tsx',
    "  const [tag, setTag] = useState<string | null>(null);",
    "  const [tag, setTag] = useState<string | null>(null);\n  const [authView, setAuthView] = useState<'landing' | 'login'>('landing');",
    "authView state"
)

patch(
    'frontend/src/App.tsx',
    "  if (!user) return <Landing onLaunch={async () => { try { await signInWithGoogle(); } catch {} }} />;",
    "  if (!user) return authView === 'landing'\n    ? <Landing onLaunch={() => setAuthView('login')} />\n    : <Login onBack={() => setAuthView('landing')} />;",
    "landing to login gate"
)

patch(
    'frontend/src/views/Landing.tsx',
    "  const handleStart = async () => {\n    try {\n      await signInWithGoogle()\n    } catch {}\n    onLaunch()\n  }",
    "  const handleStart = () => {\n    onLaunch()\n  }",
    "handleStart no direct google"
)

patch(
    'frontend/src/views/Landing.tsx',
    "  const { signInWithGoogle } = useAuth()\n  const [stats, setStats] = useState({ users: 0, transactions: 0, volume: '0.00', schedules: 0 })",
    "  const [stats, setStats] = useState({ users: 0, transactions: 0, volume: '0.00', schedules: 0 })",
    "remove unused signInWithGoogle in Landing"
)

print("All patches applied.")

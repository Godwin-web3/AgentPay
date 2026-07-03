import sys

def patch(path, old, new, label):
    with open(path, 'r') as f:
        content = f.read()
    if old not in content:
        print(f"ABORT: pattern not found for {label} in {path}")
        sys.exit(1)
    content = content.replace(old, new, 1)
    with open(path, 'w') as f:
        f.write(content)
    print(f"OK: patched {label} in {path}")

patch(
    'frontend/src/App.tsx',
    "  const { user, loading, signInWithGoogle } = useAuth();",
    "  const { user, loading } = useAuth();",
    "remove unused signInWithGoogle in App.tsx"
)

patch(
    'frontend/src/views/Landing.tsx',
    "import { useState, useEffect } from 'react'\nimport { useAuth } from '../contexts/AuthContext'",
    "import { useState, useEffect } from 'react'",
    "remove unused useAuth import in Landing.tsx"
)

print("All patches applied.")

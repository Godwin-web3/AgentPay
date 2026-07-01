#!/usr/bin/env python3

path = "frontend/src/App.tsx"
with open(path) as f:
    content = f.read()

old = "type View = 'landing' | 'terminal' | 'account' | 'profile' | 'policy' | 'history' | 'schedules' | 'jobs' | 'marketplace'"
new = "type View = 'landing' | 'terminal' | 'account' | 'profile' | 'policy' | 'history' | 'schedules' | 'jobs' | 'marketplace' | 'agent'"

if old not in content:
    raise SystemExit("PATCH FAILED: View type not found")
content = content.replace(old, new, 1)

with open(path, "w") as f:
    f.write(content)
print("Patched frontend/src/App.tsx — added agent to View type")

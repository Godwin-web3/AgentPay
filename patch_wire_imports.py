#!/usr/bin/env python3

path = "frontend/src/App.tsx"
with open(path) as f:
    content = f.read()

old = "import Schedules from './views/Schedules'"
new = "import Schedules from './views/Schedules'\nimport Jobs from './views/Jobs'\nimport Marketplace from './views/Marketplace'"

if old not in content:
    raise SystemExit("PATCH FAILED: Schedules import not found")
content = content.replace(old, new, 1)

with open(path, "w") as f:
    f.write(content)
print("Patched imports")

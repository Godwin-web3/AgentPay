#!/usr/bin/env python3

path = "frontend/src/index.css"
with open(path) as f:
    content = f.read()

old = """.app {
  display: flex;
  height: 100vh;
  height: 100dvh;
  width: 100vw;
  position: relative;
  z-index: 1;
  overflow: visible;
}"""

new = """.app {
  display: flex;
  height: 100vh;
  height: 100dvh;
  height: var(--app-height, 100dvh);
  width: 100vw;
  position: relative;
  z-index: 1;
  overflow: visible;
}"""

if old not in content:
    raise SystemExit("PATCH FAILED: .app block not found")
content = content.replace(old, new, 1)

with open(path, "w") as f:
    f.write(content)

print("✅ Patched frontend/src/index.css — .app now uses live viewport height")

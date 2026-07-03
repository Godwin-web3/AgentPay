#!/usr/bin/env python3

path = "frontend/src/index.css"
with open(path) as f:
    content = f.read()

old1 = "  padding-bottom: calc(var(--bottom-nav-height) + 16px);\n}"
new1 = "  padding-bottom: calc(var(--bottom-nav-height) + 4px);\n}"

count = content.count(old1)
if count == 0:
    raise SystemExit("PATCH FAILED: padding-bottom pattern not found")

content = content.replace(old1, new1)

with open(path, "w") as f:
    f.write(content)

print(f"✅ Tightened padding-bottom in {count} spot(s)")

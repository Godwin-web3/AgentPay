#!/usr/bin/env python3

path = "frontend/src/index.css"
with open(path) as f:
    content = f.read()

marker = "/* Mobile Bottom Nav */"
if marker not in content:
    raise SystemExit("PATCH FAILED: mobile nav marker not found")

addition = """/* When the on-screen keyboard is open, the fixed nav bar sits behind it —
   collapse the padding that was reserving space for it, and hide the nav
   entirely so nothing floats in dead space above the keyboard. */
.keyboard-open .view-content {
  padding-bottom: 16px !important;
}
.keyboard-open .terminal {
  padding-bottom: 16px !important;
}
.keyboard-open .mobile-nav {
  display: none !important;
}

/* Mobile Bottom Nav */"""

content = content.replace(marker, addition, 1)

with open(path, "w") as f:
    f.write(content)

print("✅ Patched index.css — keyboard-open state collapses reserved nav padding")

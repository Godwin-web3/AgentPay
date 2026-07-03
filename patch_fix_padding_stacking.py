#!/usr/bin/env python3

path = "frontend/src/index.css"
with open(path) as f:
    content = f.read()

old = """/* View Container */
.view-content {
  flex: 1;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  width: 100%;
  position: relative;
  padding-bottom: calc(var(--bottom-nav-height) + 4px);
}

/* Terminal / Chat System */
.terminal {
  flex: 1;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  padding: 24px;
  background: radial-gradient(circle at top right, rgba(77, 159, 255, 0.03), transparent 40%);
}

@media (max-width: 768px) {
  .terminal {
    padding: 16px;
    padding-bottom: calc(var(--bottom-nav-height) + 16px);
  }
}"""

new = """/* View Container */
.view-content {
  flex: 1;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  width: 100%;
  position: relative;
  padding-bottom: 16px;
}

@media (max-width: 768px) {
  .view-content {
    padding-bottom: calc(var(--bottom-nav-height) + 16px);
  }
}

/* Terminal / Chat System */
.terminal {
  flex: 1;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  padding: 24px;
  background: radial-gradient(circle at top right, rgba(77, 159, 255, 0.03), transparent 40%);
}

@media (max-width: 768px) {
  .terminal {
    padding: 16px;
  }
}"""

if old not in content:
    raise SystemExit("PATCH FAILED: block not found")
content = content.replace(old, new, 1)

with open(path, "w") as f:
    f.write(content)

print("✅ Fixed padding stacking — nav clearance now reserved exactly once, mobile-only")

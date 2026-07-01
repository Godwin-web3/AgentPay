#!/usr/bin/env python3
import re

path = "frontend/src/index.css"
with open(path) as f:
    content = f.read()

# Font import
content = re.sub(
    r"@import url\('https://fonts\.googleapis\.com/css2\?family=Syne:wght@600;700;800[^']*'\);",
    "@import url('https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,500;9..144,600;9..144,700&family=JetBrains+Mono:wght@300;400;500;700&family=Inter:wght@300;400;500&display=swap');",
    content,
    count=1
)

# Root variables - more flexible match
root_pattern = r":root\s*\{[^}]*\}"
root_match = re.search(root_pattern, content, re.DOTALL)

if root_match:
    old_root = root_match.group(0)
    new_root = """:root {
  --bg:         #0B0D10;
  --bg-card:    #15181C;
  --bg-hover:   #1B1F24;
  --border:     #262B31;
  --border-hot: #D9A44144;
  --blue:       #5B8CA6;
  --coral:      #D9A441;
  --cyan:       #5B8CA6;
  --seal:       #D9A441;
  --wire:       #5B8CA6;
  --text:       #EDEAE2;
  --muted:      #6B7280;
  --danger:     #C4573F;
  --success:    #D9A441;
  --warning:    #C4573F;
  --font-mono:  'JetBrains Mono', monospace;
  --font-head:  'Fraunces', serif;
  --font-body:  'Inter', sans-serif;

  --header-height: 70px;
  --sidebar-width: 240px;
  --bottom-nav-height: 65px;
}"""
    content = content.replace(old_root, new_root, 1)
    print("✅ Updated :root variables")
else:
    print("❌ Could not find :root block")
    exit(1)

# Scanline removal + new glow
content = re.sub(
    r"/\* UI Scanline and Glow Effects \*/[\s\S]*?body::after\s*\{[\s\S]*?\}",
    """/* Ambient glow — quiet, institutional */
body::after {
  content: '';
  position: fixed;
  top: -30%;
  left: -20%;
  width: 60%;
  height: 60%;
  background: radial-gradient(ellipse, #D9A4410A 0%, transparent 70%);
  pointer-events: none;
  z-index: 0;
  animation: ambientShift 12s ease-in-out infinite alternate;
}""",
    content,
    count=1
)

# Logo
content = re.sub(
    r"\.sidebar-logo h1\s*\{[\s\S]*?\}",
    """.sidebar-logo h1 {
  font-family: var(--font-head);
  font-size: 21px;
  letter-spacing: 0.5px;
  color: var(--text);
  font-weight: 600;
  font-style: italic;
}""",
    content,
    count=1
)

# Badge / Seal
content = re.sub(
    r"\.tx-badge\s*\{[\s\S]*?\}\s*\.tx-badge\.(success|rejected|failed)\s*\{[\s\S]*?\}",
    """.tx-badge {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 5px 12px 5px 8px;
  border-radius: 3px;
  font-size: 11px;
  font-family: var(--font-mono);
  text-decoration: none;
  margin-top: 8px;
  letter-spacing: 0.5px;
  text-transform: uppercase;
}

.tx-badge::before {
  content: '';
  width: 7px;
  height: 7px;
  border-radius: 50%;
  flex-shrink: 0;
}

.tx-badge.success { 
  background: #D9A44112; 
  border: 1px solid #D9A44144; 
  color: var(--seal); 
  transform: rotate(-1deg); 
}
.tx-badge.success::before { 
  background: var(--seal); 
  box-shadow: 0 0 6px #D9A44188; 
}
.tx-badge.rejected { 
  background: #C4573F12; 
  border: 1px solid #C4573F44; 
  color: var(--warning); 
}
.tx-badge.rejected::before { background: var(--warning); }
.tx-badge.failed { 
  background: #C4573F12; 
  border: 1px solid #C4573F44; 
  color: var(--danger); 
}
.tx-badge.failed::before { background: var(--danger); }""",
    content,
    count=1
)

with open(path, "w") as f:
    f.write(content)

print("✅ Successfully patched frontend/src/index.css with new rebrand foundation!")

#!/usr/bin/env python3

path = "frontend/src/index.css"
with open(path) as f:
    content = f.read()

old_import = "@import url('https://fonts.googleapis.com/css2?family=Syne:wght@600;700;800&family=JetBrains+Mono:wght@300;400;500;700&family=Inter:wght@300;400;500&display=swap');"
new_import = "@import url('https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,500;9..144,600;9..144,700&family=JetBrains+Mono:wght@300;400;500;700&family=Inter:wght@300;400;500&display=swap');"

if old_import not in content:
    raise SystemExit("PATCH FAILED: font import not found")
content = content.replace(old_import, new_import, 1)

old_root = """:root {
  --bg:         #0A0A0A;
  --bg-card:    #141414;
  --bg-hover:   #1a1a1a;
  --border:     #262626;
  --border-hot: #4fdbc844;
  --blue:       #4fdbc8;
  --coral:      #FF6B35;
  --cyan:       #4fdbc8;
  --text:       #E0E0E0;
  --muted:      #555555;
  --danger:     #FF3B5C;
  --success:    #4fdbc8;
  --warning:    #FF6B35;
  --font-mono:  'JetBrains Mono', monospace;
  --font-head:  'Syne', sans-serif;
  --font-body:  'Inter', sans-serif;

  --header-height: 70px;
  --sidebar-width: 240px;
  --bottom-nav-height: 65px;
}"""

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

if old_root not in content:
    raise SystemExit("PATCH FAILED: :root block not found")
content = content.replace(old_root, new_root, 1)

# Remove the scanline overlay — it's part of the generic terminal-hacker look we're moving away from
old_scanline = """/* UI Scanline and Glow Effects */
body::before {
  content: '';
  position: fixed;
  inset: 0;
  background: repeating-linear-gradient(0deg, transparent, transparent 2px, rgba(0, 0, 0, 0.03) 2px, rgba(0, 0, 0, 0.03) 4px);
  pointer-events: none;
  z-index: 9999;
}

body::after {
  content: '';
  position: fixed;
  top: -30%;
  left: -20%;
  width: 60%;
  height: 60%;
  background: radial-gradient(ellipse, #4D9FFF0A 0%, transparent 70%);
  pointer-events: none;
  z-index: 0;
  animation: ambientShift 8s ease-in-out infinite alternate;
}"""

new_scanline = """/* Ambient glow — quiet, no scanlines */
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
}"""

if old_scanline not in content:
    raise SystemExit("PATCH FAILED: scanline block not found")
content = content.replace(old_scanline, new_scanline, 1)

# Sidebar wordmark — serif now, no gradient-fill trick, quieter and more confident
old_logo = """.sidebar-logo h1 {
  font-family: var(--font-head);
  font-size: 18px;
  letter-spacing: 3px;
  background: linear-gradient(135deg, var(--blue), var(--cyan));
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
  font-weight: 900;
}"""

new_logo = """.sidebar-logo h1 {
  font-family: var(--font-head);
  font-size: 21px;
  letter-spacing: 0.5px;
  color: var(--text);
  font-weight: 600;
  font-style: italic;
}"""

if old_logo not in content:
    raise SystemExit("PATCH FAILED: sidebar-logo h1 not found")
content = content.replace(old_logo, new_logo, 1)

# Signature element: seal stamp for confirmed on-chain actions — replaces plain tx-badge
old_badge = """.tx-badge {
  display: inline-flex;
  align-items: center;
  padding: 6px 12px;
  border-radius: 3px;
  font-size: 11px;
  font-family: var(--font-mono);
  text-decoration: none;
  margin-top: 8px;
}

.tx-badge.success { background: #00E5CC15; border: 1px solid #00E5CC44; color: var(--cyan); }
.tx-badge.rejected { background: #FF6B3515; border: 1px solid #FF6B3544; color: var(--warning); }
.tx-badge.failed { background: #FF3B5C15; border: 1px solid #FF3B5C44; color: var(--danger); }"""

new_badge = """.tx-badge {
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

.tx-badge.success { background: #D9A44112; border: 1px solid #D9A44144; color: var(--seal); transform: rotate(-1deg); }
.tx-badge.success::before { background: var(--seal); box-shadow: 0 0 6px #D9A44188; }
.tx-badge.rejected { background: #C4573F12; border: 1px solid #C4573F44; color: var(--warning); }
.tx-badge.rejected::before { background: var(--warning); }
.tx-badge.failed { background: #C4573F12; border: 1px solid #C4573F44; color: var(--danger); }
.tx-badge.failed::before { background: var(--danger); }"""

if old_badge not in content:
    raise SystemExit("PATCH FAILED: tx-badge block not found")
content = content.replace(old_badge, new_badge, 1)

with open(path, "w") as f:
    f.write(content)

print("✅ Patched frontend/src/index.css — foundation tokens, fonts, and seal-stamp signature element updated")

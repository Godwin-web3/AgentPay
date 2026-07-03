#!/usr/bin/env python3

path = "frontend/src/App.tsx"
with open(path) as f:
    content = f.read()

old = """  useEffect(() => {
    function setAppHeight() {
      const vh = window.visualViewport ? window.visualViewport.height : window.innerHeight
      document.documentElement.style.setProperty('--app-height', vh + 'px')
    }
    setAppHeight()
    if (window.visualViewport) {
      window.visualViewport.addEventListener('resize', setAppHeight)
      return () => window.visualViewport?.removeEventListener('resize', setAppHeight)
    } else {
      window.addEventListener('resize', setAppHeight)
      return () => window.removeEventListener('resize', setAppHeight)
    }
  }, [])"""

new = """  useEffect(() => {
    function setAppHeight() {
      const vh = window.visualViewport ? window.visualViewport.height : window.innerHeight
      document.documentElement.style.setProperty('--app-height', vh + 'px')
      const keyboardOpen = window.innerHeight - vh > 150
      document.documentElement.classList.toggle('keyboard-open', keyboardOpen)
    }
    setAppHeight()
    if (window.visualViewport) {
      window.visualViewport.addEventListener('resize', setAppHeight)
      return () => window.visualViewport?.removeEventListener('resize', setAppHeight)
    } else {
      window.addEventListener('resize', setAppHeight)
      return () => window.removeEventListener('resize', setAppHeight)
    }
  }, [])"""

if old not in content:
    raise SystemExit("PATCH FAILED: previous useEffect not found")
content = content.replace(old, new, 1)

with open(path, "w") as f:
    f.write(content)

print("✅ Patched App.tsx — now detects keyboard-open state")

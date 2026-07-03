#!/usr/bin/env python3

path = "frontend/src/App.tsx"
with open(path) as f:
    content = f.read()

anchor = "const [view, setView] = useState<View>(() => (localStorage.getItem('agentpay_view') as View) || 'landing')"

if anchor not in content:
    raise SystemExit("PATCH FAILED: view state anchor not found")

insert = """const [view, setView] = useState<View>(() => (localStorage.getItem('agentpay_view') as View) || 'landing')

  useEffect(() => {
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

content = content.replace(anchor, insert, 1)

with open(path, "w") as f:
    f.write(content)

print("✅ Patched frontend/src/App.tsx — visualViewport height tracking added")

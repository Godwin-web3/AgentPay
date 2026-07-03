#!/usr/bin/env python3

path = "frontend/src/App.tsx"
with open(path) as f:
    content = f.read()

old = """  useEffect(() => {
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

new = """  const [debugInfo, setDebugInfo] = useState('')

  useEffect(() => {
    function setAppHeight() {
      const vh = window.visualViewport ? window.visualViewport.height : window.innerHeight
      document.documentElement.style.setProperty('--app-height', vh + 'px')
      const keyboardOpen = window.innerHeight - vh > 150
      document.documentElement.classList.toggle('keyboard-open', keyboardOpen)
      setDebugInfo(`inner=${window.innerHeight} vv=${Math.round(vh)} kb=${keyboardOpen} hasVV=${!!window.visualViewport}`)
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
    raise SystemExit("PATCH FAILED: useEffect not found")
content = content.replace(old, new, 1)

# Add a small fixed debug badge right after the opening <div className="app"> in the main return block
old_app_div = '''    <div className="app">'''
new_app_div = '''    <div className="app">
      <div style={{ position: 'fixed', top: 0, left: 0, zIndex: 99999, background: 'red', color: 'white', fontSize: 10, padding: 4, fontFamily: 'monospace' }}>{debugInfo}</div>'''

count = content.count(old_app_div)
if count == 0:
    raise SystemExit("PATCH FAILED: no <div className=\\\"app\\\"> found")

# Only patch the LAST occurrence (the main authenticated view, not the loading/landing states)
idx = content.rfind(old_app_div)
content = content[:idx] + new_app_div + content[idx + len(old_app_div):]

with open(path, "w") as f:
    f.write(content)

print(f"✅ Patched App.tsx — debug badge added ({count} 'app' divs found, patched the last one)")

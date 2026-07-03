#!/usr/bin/env python3

path = "frontend/src/App.tsx"
with open(path) as f:
    content = f.read()

old = """  const [debugInfo, setDebugInfo] = useState('')

  useEffect(() => {
    function setAppHeight() {
      const vh = window.visualViewport ? window.visualViewport.height : window.innerHeight
      document.documentElement.style.setProperty('--app-height', vh + 'px')
      const keyboardOpen = window.innerHeight - vh > 150
      document.documentElement.classList.toggle('keyboard-open', keyboardOpen)
      setDebugInfo(`inner=${window.innerHeight} vv=${Math.round(vh)} kb=${keyboardOpen} hasVV=${!!window.visualViewport}`)
    }"""

new = """  useEffect(() => {
    function setAppHeight() {
      const vh = window.visualViewport ? window.visualViewport.height : window.innerHeight
      document.documentElement.style.setProperty('--app-height', vh + 'px')
      const keyboardOpen = window.innerHeight - vh > 150
      document.documentElement.classList.toggle('keyboard-open', keyboardOpen)
    }"""

if old not in content:
    raise SystemExit("PATCH FAILED: debugInfo block not found")
content = content.replace(old, new, 1)

with open(path, "w") as f:
    f.write(content)

print("✅ Removed unused debugInfo state — build should pass now")

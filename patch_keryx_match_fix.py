#!/usr/bin/env python3

path = "src/agent.js"
with open(path) as f:
    content = f.read()

old = """async function findKeryxTool(description) {
  try {
    const res = await fetch(`${KERYX_BASE}/api/tools`, { signal: AbortSignal.timeout(5000) });
    const { tools } = await res.json();
    const lower = description.toLowerCase();
    return tools.find(t =>
      lower.includes(t.name.toLowerCase()) ||
      (t.description && lower.split(' ').some(w => w.length > 4 && t.description.toLowerCase().includes(w)))
    ) || null;
  } catch (e) {
    return null;
  }
}"""

new = """const KERYX_KEYWORDS = {
  'crypto.trending': ['top coins', 'trending', 'top crypto', 'popular coins', 'hot coins'],
  'crypto.price': ['price of', 'crypto price', 'coin price', 'how much is'],
  'crypto.btc-dominance': ['btc dominance', 'market dominance', 'bitcoin dominance'],
  'weather.current': ['current weather', 'weather right now', 'weather today'],
  'weather.forecast': ['weather forecast', 'forecast for'],
  'finance.exchange-rates': ['exchange rate', 'exchange rates'],
  'finance.convert': ['convert', 'currency conversion'],
  'solana.token-activity': ['solana token', 'token trading data', 'dex pairs'],
  'solana.launches': ['new solana token', 'solana launches'],
  'solana.rug-check': ['rug check', 'rug risk', 'is this token safe'],
  'search.web': ['what is', 'who is', 'define', 'history of'],
  'web.hacker-news': ['hacker news', 'hn top'],
  'web.github-repo': ['github repo', 'github stars'],
  'geo.ip-lookup': ['ip lookup', 'geolocate ip'],
  'geo.country': ['country info', 'capital of'],
  'time.current': ['current time', 'what time is it'],
  'dns.domain-whois': ['whois', 'domain info'],
  'utility.qr': ['qr code'],
  'utility.uuid': ['generate uuid', 'unique id']
};

async function findKeryxTool(description) {
  try {
    const res = await fetch(`${KERYX_BASE}/api/tools`, { signal: AbortSignal.timeout(5000) });
    const { tools } = await res.json();
    const lower = description.toLowerCase();

    for (const [toolId, keywords] of Object.entries(KERYX_KEYWORDS)) {
      if (keywords.some(k => lower.includes(k))) {
        const match = tools.find(t => t.id === toolId);
        if (match) return match;
      }
    }

    return tools.find(t =>
      lower.includes(t.name.toLowerCase()) ||
      (t.summary && lower.split(' ').some(w => w.length > 4 && t.summary.toLowerCase().includes(w)))
    ) || null;
  } catch (e) {
    return null;
  }
}"""

if old not in content:
    raise SystemExit("PATCH FAILED: findKeryxTool not found")
content = content.replace(old, new, 1)

with open(path, "w") as f:
    f.write(content)
print("Patched src/agent.js — fixed Keryx tool matching, added keyword map")

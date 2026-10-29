const fs = require('fs');
const path = require('path');
const { PaymentRequest } = require('./PaymentRequest');

const STORE_PATH = path.join(process.cwd(), 'data', 'payment-requests.json');

function ensureDir() {
  const dir = path.dirname(STORE_PATH);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

function load() {
  ensureDir();
  if (!fs.existsSync(STORE_PATH)) return new Map();
  const raw = JSON.parse(fs.readFileSync(STORE_PATH, 'utf8') || '[]');
  const map = new Map();
  for (const item of raw) {
    const req = new PaymentRequest(item);
    req.state = item.state;
    req.requestId = item.requestId;
    req.txHash = item.txHash;
    req.settledAt = item.settledAt;
    map.set(req.id, req);
  }
  return map;
}

function save(map) {
  ensureDir();
  const arr = Array.from(map.values()).map(r => r.toJSON());
  fs.writeFileSync(STORE_PATH, JSON.stringify(arr, null, 2));
}

module.exports = { load, save, STORE_PATH };

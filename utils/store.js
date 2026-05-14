const fs = require('fs');
const path = require('path');

const STORE_PATH = path.join(__dirname, '../data/spendLog.json');

function stringify(obj) {
  return JSON.stringify(obj, function(key, value) {
    return typeof value === 'bigint' ? value.toString() : value;
  }, 2);
}

function ensureStore() {
  const dir = path.join(__dirname, '../data');
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  if (!fs.existsSync(STORE_PATH)) {
    fs.writeFileSync(STORE_PATH, stringify({ spends: [], sessions: [] }));
  }
}

function readStore() {
  ensureStore();
  return JSON.parse(fs.readFileSync(STORE_PATH, 'utf8'));
}

function writeStore(data) {
  ensureStore();
  fs.writeFileSync(STORE_PATH, stringify(data));
}

function appendSpend({ to, amount, reason, txHash, agentId }) {
  const store = readStore();
  store.spends.push({
    to,
    amount,
    reason,
    txHash,
    agentId: agentId ? agentId.toString() : null,
    timestamp: Date.now(),
    date: new Date().toDateString()
  });
  writeStore(store);
}

function appendFailure({ to, amount, reason, blockedReason, agentId }) {
  const store = readStore();
  store.spends.push({
    to,
    amount,
    reason,
    blockedReason: blockedReason ? blockedReason.slice(0, 100) : '',
    agentId: agentId ? agentId.toString() : null,
    failed: true,
    timestamp: Date.now(),
    date: new Date().toDateString()
  });
  writeStore(store);
}

function getTodaySpend() {
  const store = readStore();
  const today = new Date().toDateString();
  return store.spends
    .filter(function(s) { return s.date === today && !s.failed; })
    .reduce(function(sum, s) { return sum + s.amount; }, 0);
}

function getLastHourTxCount() {
  const store = readStore();
  const oneHourAgo = Date.now() - 60 * 60 * 1000;
  return store.spends.filter(function(s) { return s.timestamp > oneHourAgo && !s.failed; }).length;
}

function getConsecutiveFailures() {
  const store = readStore();
  const spends = store.spends;
  let count = 0;
  for (let i = spends.length - 1; i >= 0; i--) {
    if (spends[i].failed) count++;
    else break;
  }
  return count;
}

function getHistory(limit) {
  limit = limit || 20;
  const store = readStore();
  return store.spends.slice(-limit).reverse();
}

function appendSwap({ fromToken, toToken, amount, txHash }) {
  const store = readStore();
  store.spends.push({
    type: 'swap',
    fromToken,
    toToken,
    amount,
    txHash,
    timestamp: Date.now(),
    date: new Date().toDateString()
  });
  writeStore(store);
}

module.exports = {
  appendSpend,
  appendSwap,
  appendFailure,
  getTodaySpend,
  getLastHourTxCount,
  getConsecutiveFailures,
  getHistory
};

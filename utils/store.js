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

function appendSpend({ userAddress, to, amount, reason, txHash, agentId, token }) {
  const store = readStore();
  store.spends.push({
    userAddress,
    to,
    amount,
    token: token || 'STT',
    reason,
    txHash,
    agentId: agentId ? agentId.toString() : null,
    timestamp: Date.now(),
    date: new Date().toDateString()
  });
  writeStore(store);
}

function appendFailure({ userAddress, to, amount, reason, blockedReason, agentId }) {
  const store = readStore();
  store.spends.push({
    userAddress,
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

function getTodaySpend(userAddress) {
  const store = readStore();
  const today = new Date().toDateString();
  return store.spends
    .filter(function(s) { 
      return s.date === today && !s.failed && (!userAddress || s.userAddress === userAddress); 
    })
    .reduce(function(sum, s) { return sum + s.amount; }, 0);
}

function getLastHourTxCount(userAddress) {
  const store = readStore();
  const oneHourAgo = Date.now() - 60 * 60 * 1000;
  return store.spends.filter(function(s) { 
    return s.timestamp > oneHourAgo && !s.failed && (!userAddress || s.userAddress === userAddress); 
  }).length;
}

function getConsecutiveFailures(userAddress) {
  const store = readStore();
  const spends = store.spends;
  let count = 0;
  for (let i = spends.length - 1; i >= 0; i--) {
    if (userAddress && spends[i].userAddress !== userAddress) continue;
    if (spends[i].failed) count++;
    else break;
  }
  return count;
}

function getHistory(userAddress, limit) {
  limit = limit || 50;
  const store = readStore();
  return store.spends
    .filter(s => !userAddress || !s.userAddress || s.userAddress === userAddress)
    .slice(-limit)
    .reverse();
}

function appendSwap({ userAddress, fromToken, toToken, amount, txHash }) {
  const store = readStore();
  store.spends.push({
    userAddress,
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

function appendInference({ userAddress, message, response, requestId, verifiable }) {
  const store = readStore();
  store.spends.push({
    userAddress,
    type: 'inference',
    message,
    response,
    requestId,
    verifiable: !!verifiable,
    timestamp: Date.now(),
    date: new Date().toDateString()
  });
  writeStore(store);
}

module.exports = {
  appendSpend,
  appendSwap,
  appendFailure,
  appendInference,
  getTodaySpend,
  getLastHourTxCount,
  getConsecutiveFailures,
  getHistory
};

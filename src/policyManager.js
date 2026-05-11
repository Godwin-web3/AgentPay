const fs = require('fs');
const path = require('path');

const POLICY_PATH = path.join(__dirname, '../config/policy.json');

function readPolicy() {
  return JSON.parse(fs.readFileSync(POLICY_PATH, 'utf8'));
}

function writePolicy(policy) {
  fs.writeFileSync(POLICY_PATH, JSON.stringify(policy, null, 2));
}

function updateDailyCapSTT(amount) {
  const policy = readPolicy();
  const old = policy.dailyCapSTT;
  policy.dailyCapSTT = amount;
  writePolicy(policy);
  return 'Daily cap updated from ' + old + ' to ' + amount + ' STT';
}

function updatePerTxCapSTT(amount) {
  const policy = readPolicy();
  const old = policy.perTxCapSTT;
  policy.perTxCapSTT = amount;
  writePolicy(policy);
  return 'Per-tx cap updated from ' + old + ' to ' + amount + ' STT';
}

function addToWhitelist(address) {
  const policy = readPolicy();
  const normalized = address.toLowerCase();
  const existing = policy.allowedRecipients.map(function(a) { return a.toLowerCase(); });
  if (existing.includes(normalized)) {
    return address + ' is already whitelisted';
  }
  policy.allowedRecipients.push(address);
  writePolicy(policy);
  return address + ' added to whitelist';
}

function removeFromWhitelist(address) {
  const policy = readPolicy();
  const before = policy.allowedRecipients.length;
  policy.allowedRecipients = policy.allowedRecipients.filter(function(a) {
    return a.toLowerCase() !== address.toLowerCase();
  });
  if (policy.allowedRecipients.length === before) {
    return address + ' was not in whitelist';
  }
  writePolicy(policy);
  return address + ' removed from whitelist';
}

function updateActiveHours(start, end) {
  const policy = readPolicy();
  policy.activeHours.start = start;
  policy.activeHours.end = end;
  writePolicy(policy);
  return 'Active hours updated to ' + start + ':00 — ' + end + ':00';
}

function updateMaxTxPerHour(max) {
  const policy = readPolicy();
  policy.circuitBreaker.maxTxPerHour = max;
  writePolicy(policy);
  return 'Max tx per hour updated to ' + max;
}

function applyUpdate(intent) {
  const update = intent.policyUpdate;
  if (!update) return null;

  switch (update.field) {
    case 'dailyCap':
      return updateDailyCapSTT(update.value);
    case 'perTxCap':
      return updatePerTxCapSTT(update.value);
    case 'addWhitelist':
      return addToWhitelist(update.address);
    case 'removeWhitelist':
      return removeFromWhitelist(update.address);
    case 'activeHours':
      return updateActiveHours(update.start, update.end);
    case 'maxTxPerHour':
      return updateMaxTxPerHour(update.value);
    default:
      return 'Unknown policy field: ' + update.field;
  }
}

module.exports = { applyUpdate, readPolicy };

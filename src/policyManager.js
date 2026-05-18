const fs = require('fs');
const path = require('path');

const POLICY_PATH = path.join(__dirname, '../config/policy.json');

function ensurePolicy() {
  const dir = path.join(__dirname, '../config');
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  if (!fs.existsSync(POLICY_PATH)) {
    const defaultPolicy = {
      perTxCapSTT: 10,
      dailyCapSTT: 50,
      allowedRecipients: [],
      activeHours: { start: 0, end: 24 },
      circuitBreaker: {
        maxTxPerHour: 10,
        maxConsecutiveFailures: 3,
        pauseDurationMinutes: 15
      }
    };
    fs.writeFileSync(POLICY_PATH, JSON.stringify(defaultPolicy, null, 2));
  }
}

function readPolicy() {
  ensurePolicy();
  return JSON.parse(fs.readFileSync(POLICY_PATH, 'utf8'));
}

function applyUpdate(update) {
  ensurePolicy();
  const current = readPolicy();
  
  if (update.perTxCap !== undefined) current.perTxCapSTT = update.perTxCap;
  if (update.dailyCap !== undefined) current.dailyCapSTT = update.dailyCap;
  if (update.whitelist !== undefined) current.allowedRecipients = update.whitelist;
  if (update.activeHours !== undefined) current.activeHours = update.activeHours;
  
  if (update.field === 'addWhitelist' && update.address) {
    if (!current.allowedRecipients.includes(update.address)) {
      current.allowedRecipients.push(update.address);
    }
  }
  
  if (update.field === 'removeWhitelist' && update.address) {
    current.allowedRecipients = current.allowedRecipients.filter(a => a !== update.address);
  }

  fs.writeFileSync(POLICY_PATH, JSON.stringify(current, null, 2));
  return current;
}

module.exports = { readPolicy, applyUpdate };

const fs = require('fs');
const path = require('path');

const POLICY_PATH = path.join(__dirname, '../config/policy.json');

function readPolicy() {
  return JSON.parse(fs.readFileSync(POLICY_PATH, 'utf8'));
}

module.exports = { readPolicy };

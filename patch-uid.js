const fs = require('fs');
const path = require('path');

const views = [
  'frontend/src/views/Terminal.tsx',
  'frontend/src/views/History.tsx',
  'frontend/src/views/Policy.tsx',
  'frontend/src/views/Vault.tsx',
  'frontend/src/views/Schedules.tsx',
  'frontend/src/views/Onboarding.tsx',
];

const AUTH_IMPORT = "import { useAuth } from '../contexts/AuthContext'";
const AUTH_HOOK = "  const { user } = useAuth();\n  const userId = user?.uid || '';";

for (const rel of views) {
  const file = path.join('/root/AgentPay-clean', rel);
  if (!fs.existsSync(file)) { console.log('SKIP:', rel); continue; }

  let src = fs.readFileSync(file, 'utf8');

  // Add useAuth import after first import line
  if (!src.includes("useAuth")) {
    src = src.replace(
      /(import .+\n)/,
      `$1${AUTH_IMPORT}\n`
    );
  }

  // Add hook inside component (after first opening brace of default export)
  if (!src.includes("const userId = user?.uid")) {
    src = src.replace(
      /(export default function \w+[^{]+\{)/,
      `$1\n${AUTH_HOOK}`
    );
  }

  // Replace userAddress in API calls with userId
  // Only replace when passed as last arg to API functions (not display)
  src = src.replace(/\b(getChatHistory|clearChatHistory|executePay|hireAgent|getVaultBalanceApi|getPolicy|updatePolicy|getSchedules|createOnChainSchedule|cancelSchedule|checkVault|getVaultAddress|getWallet|getCircleBalance|depositToVault|withdrawFromVault|logTransaction|getOnChainSchedules|cancelOnChainSchedule|sendChat|getJob|completeJob)\(([^)]*),\s*userAddress\)/g,
    '$1($2, userId)');

  // Single-arg API calls
  src = src.replace(/\b(getChatHistory|clearChatHistory|getPolicy|getSchedules|checkVault|getVaultAddress|getWallet|getCircleBalance|getOnChainSchedules)\(\s*userAddress\s*\)/g,
    '$1(userId)');

  fs.writeFileSync(file, src, 'utf8');
  console.log('PATCHED:', rel);
}
console.log('Done.');

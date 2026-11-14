// Replace the logic behind a proxy or beacon. The address in the deployment
// file does not change. The live contract already on Arc is not a proxy and
// cannot be upgraded in place. The next deploy is the last address change.
//
//   node scripts/upgrade.js PoolVault
//   node scripts/upgrade.js UserVaults
//   node scripts/upgrade.js VaultFactory
//   node scripts/upgrade.js DecisionLog
//   node scripts/upgrade.js SwapExecutor
//   node scripts/upgrade.js AgentVault artifacts/AgentVault-84532.json
//
// PoolVault upgrades are signed by upgradeAdmin (the deployer), not by the
// agent who receives operational ownership. User vaults share one beacon;
// that file is UserVaults-deployment.json and the deployer key signs it.
require('dotenv').config();
const { ethers } = require('ethers');
const fs = require('fs');
const path = require('path');
const { CHAINS } = require('../config/chains');
const { rpcFor } = require('../src/chain');
const { deployImplementation, loadArtifact } = require('./proxyDeploy');

function providerFor(saved) {
  const chainId = Number(saved.chainId || 5042002);
  const chain = Object.values(CHAINS).find((item) => Number(item.chainId) === chainId);
  if (!chain) throw new Error('No RPC configured for chain ' + chainId);
  return new ethers.JsonRpcProvider(
    rpcFor(chain),
    { chainId: chain.chainId, name: chain.id },
    { staticNetwork: true }
  );
}

function adminFunction(saved, logicName) {
  if (saved.upgradeKind === 'beacon') return 'owner';
  const artifact = loadArtifact(logicName);
  const hasUpgradeAdmin = artifact.abi.some((item) => item.type === 'function' && item.name === 'upgradeAdmin');
  return hasUpgradeAdmin ? 'upgradeAdmin' : 'owner';
}

async function main() {
  const name = process.argv[2];
  if (!name) throw new Error('Usage: node scripts/upgrade.js <ContractName> [deploymentFile]');
  if (!process.env.PRIVATE_KEY) throw new Error('PRIVATE_KEY is required');

  const file = process.argv[3]
    ? path.resolve(process.argv[3])
    : path.join(__dirname, '../artifacts', name + '-deployment.json');
  if (!fs.existsSync(file)) throw new Error('No deployment file at ' + file);
  const saved = JSON.parse(fs.readFileSync(file, 'utf8'));
  const provider = providerFor(saved);
  const wallet = new ethers.Wallet(process.env.PRIVATE_KEY, provider);
  const logicName = saved.implementationContract || name;

  const implementation = await deployImplementation(wallet, logicName);
  const next = await implementation.getAddress();
  console.log('New implementation: ' + next);

  const adminFn = adminFunction(saved, logicName);
  const target = new ethers.Contract(
    saved.address,
    [
      'function owner() view returns (address)',
      'function upgradeAdmin() view returns (address)',
      'function upgradeTo(address)',
    ],
    wallet
  );
  const admin = await target[adminFn]();
  if (admin.toLowerCase() !== wallet.address.toLowerCase()) {
    throw new Error(adminFn + ' is ' + admin + '. This key cannot upgrade it.');
  }
  const tx = await target.upgradeTo(next);
  const txHash = (await tx.wait()).hash;

  saved.implementation = next;
  saved.upgradedAt = new Date().toISOString();
  saved.upgradeTxHash = txHash;
  fs.writeFileSync(file, JSON.stringify(saved, null, 2));
  console.log('Upgraded ' + saved.address);
  console.log('Tx: ' + txHash);
}

main().catch((error) => {
  console.error(error.message || error);
  process.exit(1);
});

require('dotenv').config();
const { ethers } = require('ethers');
const fs = require('fs');
const path = require('path');
const { deployImplementation, deployProxy, loadArtifact } = require('./proxyDeploy');

async function main() {
  const rpc = process.env.ARC_RPC_URL || 'https://rpc.testnet.arc.network';
  const provider = new ethers.JsonRpcProvider(rpc, { chainId: 5042002, name: 'arc-testnet' });
  await provider.getBlockNumber();
  const wallet = new ethers.Wallet(process.env.PRIVATE_KEY, provider);

  const artifactPath = path.join(__dirname, '../artifacts/VaultFactory.json');
  if (!fs.existsSync(artifactPath)) {
    console.error('❌ Artifact not found. Run: node scripts/compile.js');
    process.exit(1);
  }

  const agentAddress = process.env.AGENT_ADDRESS || wallet.address;
  const usdcAddress = process.env.USDC_CONTRACT;

  if (!usdcAddress) {
    console.error('❌ USDC_CONTRACT not set in .env');
    process.exit(1);
  }

  console.log('🚀 Deploying VaultFactory to Arc testnet...');
  console.log('👛 Deployer: ' + wallet.address);
  console.log('🤖 Agent:    ' + agentAddress);
  console.log('💵 USDC:     ' + usdcAddress);

  const vaultImpl = await deployImplementation(wallet, 'AgentVault');
  const beaconArtifact = loadArtifact('UpgradeableBeacon');
  const beaconFactory = new ethers.ContractFactory(beaconArtifact.abi, beaconArtifact.bytecode, wallet);
  const beacon = await beaconFactory.deploy(await vaultImpl.getAddress(), wallet.address);
  await beacon.waitForDeployment();

  const implementation = await deployImplementation(wallet, 'VaultFactory');
  const deployed = await deployProxy(wallet, implementation, 'initialize', [agentAddress, usdcAddress, await beacon.getAddress()]);
  const address = deployed.address;
  const txHash = deployed.txHash;

  // P2-14: factory operator defaults to the deployer (wallet) above. If the
  // backend creates vaults via a different Circle SCA, call setOperator(that)
  // once after deploy.
  console.log('✅ VaultFactory deployed to: ' + address);
  console.log('🔗 Tx: ' + txHash);
  console.log('👤 Initial operator (can createVault): ' + wallet.address);
  console.log('');
  console.log('👉 Add to .env: VAULT_FACTORY_ADDRESS=' + address);
  console.log('👉 If backend uses a different Circle SCA as signer, call setOperator(<sca>) on the factory.');

  fs.writeFileSync(
    path.join(__dirname, '../artifacts/VaultFactory-deployment.json'),
    JSON.stringify({
      address,
      implementation: deployed.implementation,
      upgradeKind: 'proxy',
      implementationContract: 'VaultFactory',
      beacon: await beacon.getAddress(),
      vaultImplementation: await vaultImpl.getAddress(),
      agent: agentAddress,
      usdc: usdcAddress,
      network: 'Arc Testnet',
      chainId: 5042002,
      timestamp: new Date().toISOString(),
      txHash
    }, null, 2)
  );

  fs.writeFileSync(
    path.join(__dirname, '../artifacts/UserVaults-deployment.json'),
    JSON.stringify({
      address: await beacon.getAddress(),
      implementation: await vaultImpl.getAddress(),
      upgradeKind: 'beacon',
      implementationContract: 'AgentVault',
      factory: address,
      network: 'Arc Testnet',
      chainId: 5042002,
      timestamp: new Date().toISOString(),
    }, null, 2)
  );

  console.log('📝 Saved to artifacts/VaultFactory-deployment.json');
  console.log('📝 User vault beacon saved to artifacts/UserVaults-deployment.json');
  console.log('👉 Upgrade every user vault later with: node scripts/upgrade.js UserVaults');
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});

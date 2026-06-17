require('dotenv').config();
const { ethers } = require('ethers');
const fs = require('fs');
const path = require('path');

function loadArtifact(name) {
  return JSON.parse(fs.readFileSync(path.join(__dirname, '../artifacts', name + '.json'), 'utf8'));
}

async function main() {
  const provider = new ethers.JsonRpcProvider(process.env.SOMNIA_RPC_URL);
  const wallet = new ethers.Wallet(process.env.PRIVATE_KEY, provider);
  console.log('👛 Deployer:', wallet.address);

  // Deploy Factory
  console.log('\n🚀 Deploying ArcFactory...');
  const factoryArtifact = loadArtifact('ArcFactory');
  const factoryFactory = new ethers.ContractFactory(factoryArtifact.abi, factoryArtifact.bytecode, wallet);
  const factory = await factoryFactory.deploy();
  await factory.waitForDeployment();
  const factoryAddress = await factory.getAddress();
  console.log('✅ ArcFactory:', factoryAddress);

  // Deploy Router
  console.log('\n🚀 Deploying ArcRouter...');
  const routerArtifact = loadArtifact('ArcRouter');
  const routerFactory = new ethers.ContractFactory(routerArtifact.abi, routerArtifact.bytecode, wallet);
  const router = await routerFactory.deploy(factoryAddress);
  await router.waitForDeployment();
  const routerAddress = await router.getAddress();
  console.log('✅ ArcRouter:', routerAddress);

  const deployment = { factoryAddress, routerAddress, deployer: wallet.address, timestamp: new Date().toISOString() };
  fs.writeFileSync(path.join(__dirname, '../artifacts/dex-deployment.json'), JSON.stringify(deployment, null, 2));
  console.log('\n📝 Saved to artifacts/dex-deployment.json');
  console.log('🔗 Factory: https://testnet.arcscan.arc.network/address/' + factoryAddress);
  console.log('🔗 Router:  https://testnet.arcscan.arc.network/address/' + routerAddress);
}

main().catch(console.error);

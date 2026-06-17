require('dotenv').config();
const { ethers } = require('ethers');
const fs = require('fs');
const path = require('path');

async function main() {
  const rpc = process.env.ARC_RPC_URL || 'https://rpc.testnet.arc.network';
  const provider = new ethers.JsonRpcProvider(rpc);
  const wallet = new ethers.Wallet(process.env.PRIVATE_KEY, provider);

  const artifactPath = path.join(__dirname, '../artifacts/VaultFactory.json');
  if (!fs.existsSync(artifactPath)) {
    console.error('❌ Artifact not found. Run: node scripts/compile.js');
    process.exit(1);
  }

  const artifact = JSON.parse(fs.readFileSync(artifactPath, 'utf8'));
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

  const factory = new ethers.ContractFactory(artifact.abi, artifact.bytecode, wallet);
  const contract = await factory.deploy(agentAddress, usdcAddress);

  console.log('⏳ Waiting for deployment...');
  await contract.waitForDeployment();

  const address = await contract.getAddress();
  const txHash = contract.deploymentTransaction().hash;

  console.log('✅ VaultFactory deployed to: ' + address);
  console.log('🔗 Tx: ' + txHash);
  console.log('');
  console.log('👉 Add to .env: VAULT_FACTORY_ADDRESS=' + address);

  fs.writeFileSync(
    path.join(__dirname, '../artifacts/VaultFactory-deployment.json'),
    JSON.stringify({
      address,
      agent: agentAddress,
      usdc: usdcAddress,
      network: 'Arc Testnet',
      chainId: 5042002,
      timestamp: new Date().toISOString(),
      txHash
    }, null, 2)
  );

  console.log('📝 Saved to artifacts/VaultFactory-deployment.json');
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});

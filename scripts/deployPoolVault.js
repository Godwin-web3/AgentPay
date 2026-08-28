require('dotenv').config();
const { ethers } = require('ethers');
const fs = require('fs');
const path = require('path');

async function main() {
  const provider = new ethers.JsonRpcProvider(process.env.ARC_RPC, { chainId: 5042002, name: 'arc-testnet' });
  const wallet = new ethers.Wallet(process.env.PRIVATE_KEY, provider);

  const artifactPath = path.join(__dirname, '../artifacts/PoolVault.json');
  if (!fs.existsSync(artifactPath)) {
    console.error('❌ Artifact not found. Run "node scripts/compile.js" first.');
    process.exit(1);
  }
  const artifact = JSON.parse(fs.readFileSync(artifactPath, 'utf8'));

  const agentAddress = process.env.AGENT_ADDRESS || wallet.address;
  const usdcAddress = process.env.USDC_CONTRACT;
  if (!usdcAddress) {
    console.error('❌ USDC_CONTRACT not set in .env');
    process.exit(1);
  }

  console.log('🚀 Deploying PoolVault (singleton)...');
  console.log('👛 Deployer: ' + wallet.address);
  console.log('🤖 Agent:    ' + agentAddress);
  console.log('💵 USDC:     ' + usdcAddress);

  const factory = new ethers.ContractFactory(artifact.abi, artifact.bytecode, wallet);
  const contract = await factory.deploy(agentAddress, usdcAddress);

  console.log('⏳ Waiting for deployment...');
  await contract.waitForDeployment();

  const address = await contract.getAddress();
  const txHash = contract.deploymentTransaction().hash;

  console.log('✅ PoolVault deployed to: ' + address);
  console.log('🔗 Explorer: https://testnet.arcscan.arc.network/tx/' + txHash);

  fs.writeFileSync(
    path.join(__dirname, '../artifacts/PoolVault-deployment.json'),
    JSON.stringify({
      address,
      deployer: wallet.address,
      agent: agentAddress,
      usdc: usdcAddress,
      network: 'Arc Testnet',
      chainId: 5042002,
      timestamp: new Date().toISOString(),
      txHash,
    }, null, 2)
  );

  console.log('📝 Saved to artifacts/PoolVault-deployment.json');
  console.log('👉 Add to .env: POOL_VAULT_ADDRESS=' + address);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});

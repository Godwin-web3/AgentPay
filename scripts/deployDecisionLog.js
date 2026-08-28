require('dotenv').config();
const { ethers } = require('ethers');
const fs = require('fs');
const path = require('path');

async function main() {
  const provider = new ethers.JsonRpcProvider(process.env.ARC_RPC, { chainId: 5042002, name: 'arc-testnet' });
  const wallet = new ethers.Wallet(process.env.PRIVATE_KEY, provider);

  const artifactPath = path.join(__dirname, '../artifacts/DecisionLog.json');
  if (!fs.existsSync(artifactPath)) {
    console.error('❌ Artifact not found. Run "node scripts/compile.js" first.');
    process.exit(1);
  }
  const artifact = JSON.parse(fs.readFileSync(artifactPath, 'utf8'));

  const agentAddress = process.env.AGENT_ADDRESS || wallet.address;
  console.log('🚀 Deploying DecisionLog...');
  console.log('👛 Deployer: ' + wallet.address);
  console.log('🤖 Agent:    ' + agentAddress);

  const factory = new ethers.ContractFactory(artifact.abi, artifact.bytecode, wallet);
  const contract = await factory.deploy(agentAddress);

  console.log('⏳ Waiting for deployment...');
  await contract.waitForDeployment();

  const address = await contract.getAddress();
  const txHash = contract.deploymentTransaction().hash;

  console.log('✅ DecisionLog deployed to: ' + address);
  console.log('🔗 Explorer: https://testnet.arcscan.arc.network/tx/' + txHash);

  fs.writeFileSync(
    path.join(__dirname, '../artifacts/DecisionLog-deployment.json'),
    JSON.stringify({
      address,
      deployer: wallet.address,
      agent: agentAddress,
      network: 'Arc Testnet',
      chainId: 5042002,
      timestamp: new Date().toISOString(),
      txHash,
    }, null, 2)
  );

  console.log('📝 Saved to artifacts/DecisionLog-deployment.json');
  console.log('👉 Add to .env: DECISION_LOG_ADDRESS=' + address);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});

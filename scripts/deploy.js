require('dotenv').config();
const { ethers } = require('ethers');
const fs = require('fs');
const path = require('path');

async function main() {
  const provider = new ethers.JsonRpcProvider(process.env.SOMNIA_RPC_URL);
  const wallet = new ethers.Wallet(process.env.PRIVATE_KEY, provider);

  const artifactPath = path.join(__dirname, '../artifacts/AgentVault.json');
  if (!fs.existsSync(artifactPath)) {
    console.error('❌ Artifact not found. Please run "node scripts/compile.js" first.');
    process.exit(1);
  }

  const artifact = JSON.parse(fs.readFileSync(artifactPath, 'utf8'));
  
  const agentAddress = process.env.AGENT_ADDRESS || wallet.address;
  console.log('🚀 Deploying AgentVault...');
  console.log('👛 Deployer: ' + wallet.address);
  console.log('🤖 Agent:    ' + agentAddress);

  const factory = new ethers.ContractFactory(artifact.abi, artifact.bytecode, wallet);
  
  // AgentVault constructor takes the agent address
  const contract = await factory.deploy(agentAddress);
  
  console.log('⏳ Waiting for deployment...');
  await contract.waitForDeployment();

  const address = await contract.getAddress();
  const txHash = contract.deploymentTransaction().hash;

  console.log('✅ AgentVault deployed to: ' + address);
  console.log('🔗 Explorer: https://shannon-explorer.somnia.network/tx/' + txHash);

  const deployment = {
    address: address,
    deployer: wallet.address,
    agent: agentAddress,
    network: 'Somnia Shannon Testnet',
    timestamp: new Date().toISOString(),
    txHash: txHash
  };

  fs.writeFileSync(
    path.join(__dirname, '../artifacts/AgentVault-deployment.json'),
    JSON.stringify(deployment, null, 2)
  );

  console.log('📝 Deployment info saved to artifacts/AgentVault-deployment.json');
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});

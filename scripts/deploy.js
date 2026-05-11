const { ethers } = require('ethers');
const fs = require('fs');
const path = require('path');
require('dotenv').config();

async function main() {
  const artifact = JSON.parse(
    fs.readFileSync(path.join(__dirname, '../artifacts/AgentPayEscrow.json'), 'utf8')
  );

  const provider = new ethers.JsonRpcProvider(process.env.SOMNIA_RPC_URL);
  const wallet = new ethers.Wallet(process.env.PRIVATE_KEY, provider);

  console.log('🚀 Deploying AgentPayEscrow...');
  console.log('   Deployer: ' + wallet.address);

  const factory = new ethers.ContractFactory(artifact.abi, artifact.bytecode, wallet);
  const contract = await factory.deploy();
  await contract.waitForDeployment();

  const address = await contract.getAddress();

  console.log('✅ AgentPayEscrow deployed');
  console.log('   Address: ' + address);
  console.log('   TX: https://explorer.somnia.network/tx/' + contract.deploymentTransaction().hash);

  // Save address for later use
  fs.writeFileSync(
    path.join(__dirname, '../artifacts/deployment.json'),
    JSON.stringify({ address, deployer: wallet.address, timestamp: new Date().toISOString() }, null, 2)
  );

  console.log('📄 Address saved to artifacts/deployment.json');
}

main().catch(console.error);

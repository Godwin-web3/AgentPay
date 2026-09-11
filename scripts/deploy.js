require('dotenv').config();
const { ethers } = require('ethers');
const fs = require('fs');
const path = require('path');
const { getChain } = require('../config/chains');

async function main() {
  const chain = getChain();
  const provider = new ethers.JsonRpcProvider(process.env.ARC_RPC || chain.rpc);
  const wallet = new ethers.Wallet(process.env.PRIVATE_KEY, provider);

  const artifactPath = path.join(__dirname, '../artifacts/AgentVault.json');
  if (!fs.existsSync(artifactPath)) {
    console.error('Artifact not found. Run "node scripts/compile.js" first.');
    process.exit(1);
  }

  const artifact = JSON.parse(fs.readFileSync(artifactPath, 'utf8'));

  const ownerAddress = process.env.VAULT_OWNER || wallet.address;
  const agentAddress = process.env.AGENT_ADDRESS || wallet.address;
  const usdcAddress = process.env.USDC_CONTRACT || chain.usdc;
  const guardianAddress = process.env.VAULT_GUARDIAN || wallet.address;

  console.log('Deploying AgentVault on ' + chain.name);
  console.log('Deployer:  ' + wallet.address);
  console.log('Owner:     ' + ownerAddress);
  console.log('Agent:     ' + agentAddress);
  console.log('USDC:      ' + usdcAddress);
  console.log('Guardian:  ' + guardianAddress);

  const factory = new ethers.ContractFactory(artifact.abi, artifact.bytecode, wallet);
  const contract = await factory.deploy(ownerAddress, agentAddress, usdcAddress, guardianAddress);

  console.log('Waiting for deployment...');
  await contract.waitForDeployment();

  const address = await contract.getAddress();
  const txHash = contract.deploymentTransaction().hash;

  console.log('AgentVault deployed to: ' + address);
  console.log('Explorer: ' + chain.explorer + '/tx/' + txHash);

  const deployment = {
    address: address,
    deployer: wallet.address,
    owner: ownerAddress,
    agent: agentAddress,
    usdc: usdcAddress,
    guardian: guardianAddress,
    network: chain.name,
    chainId: chain.chainId,
    timestamp: new Date().toISOString(),
    txHash: txHash
  };

  fs.writeFileSync(
    path.join(__dirname, '../artifacts/AgentVault-deployment.json'),
    JSON.stringify(deployment, null, 2)
  );

  console.log('Deployment info saved to artifacts/AgentVault-deployment.json');
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});

require('dotenv').config();
const { ethers } = require('ethers');
const fs = require('fs');
const path = require('path');
const { getChain, getProvider, activeId } = require('../src/chain');
const { deployImplementation, deployProxy } = require('./proxyDeploy');

async function main() {
  const chain = getChain(process.env.CHAIN || activeId());
  const provider = getProvider(chain.id);
  if (!process.env.PRIVATE_KEY) {
    throw new Error('PRIVATE_KEY is required to deploy');
  }
  const wallet = new ethers.Wallet(process.env.PRIVATE_KEY, provider);

  const artifactPath = path.join(__dirname, '../artifacts/AgentVault.json');
  if (!fs.existsSync(artifactPath)) {
    console.error('Artifact not found. Run node scripts/compile.js first.');
    process.exit(1);
  }

  const agentAddress = process.env.AGENT_ADDRESS || wallet.address;
  const usdc = chain.stable.address;

  console.log('Deploying AgentVault on ' + chain.name + ' (' + chain.chainId + ')');
  console.log('Deployer: ' + wallet.address);
  console.log('Agent:    ' + agentAddress);
  console.log('Stable:   ' + chain.stable.symbol + ' ' + usdc);

  const implementation = await deployImplementation(wallet, 'AgentVault');
  const deployed = await deployProxy(wallet, implementation, 'initialize', [agentAddress, usdc]);
  const address = deployed.address;
  const txHash = deployed.txHash;
  console.log('AgentVault deployed to: ' + address);
  console.log('Explorer: ' + chain.explorer + '/tx/' + txHash);

  const deployment = {
    address,
    implementation: deployed.implementation,
    upgradeKind: 'proxy',
    implementationContract: 'AgentVault',
    deployer: wallet.address,
    agent: agentAddress,
    usdc,
    stableSymbol: chain.stable.symbol,
    network: chain.name,
    chainId: chain.chainId,
    chain: chain.id,
    timestamp: new Date().toISOString(),
    txHash,
  };

  const perChain = path.join(__dirname, `../artifacts/AgentVault-${chain.chainId}.json`);
  fs.writeFileSync(perChain, JSON.stringify(deployment, null, 2));
  if (chain.id === 'arc') {
    fs.writeFileSync(
      path.join(__dirname, '../artifacts/AgentVault-deployment.json'),
      JSON.stringify(deployment, null, 2)
    );
  }
  console.log('Saved ' + perChain);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});

require('dotenv').config();
const { ethers } = require('ethers');
const fs = require('fs');
const path = require('path');
const { getChain, getProvider } = require('../src/chain');
const { deployImplementation, deployProxy } = require('./proxyDeploy');

async function main() {
  const chain = getChain(process.env.CHAIN);
  if (!chain.swapRouter) {
    throw new Error(chain.name + ' has no SwapRouter02 address');
  }
  if (!process.env.PRIVATE_KEY) throw new Error('PRIVATE_KEY is required');

  const artifactPath = path.join(__dirname, '../artifacts/SwapExecutor.json');
  if (!fs.existsSync(artifactPath)) {
    console.error('Artifact not found. Run node scripts/compile.js first.');
    process.exit(1);
  }
  const provider = getProvider(chain.id);
  const wallet = new ethers.Wallet(process.env.PRIVATE_KEY, provider);
  const agentAddress = process.env.AGENT_ADDRESS || wallet.address;

  console.log('Deploying SwapExecutor on ' + chain.name);
  console.log('Agent:  ' + agentAddress);
  console.log('Stable: ' + chain.stable.symbol + ' ' + chain.stable.address);
  console.log('Router: ' + chain.swapRouter);

  const implementation = await deployImplementation(wallet, 'SwapExecutor');
  const deployed = await deployProxy(wallet, implementation, 'initialize', [agentAddress, chain.stable.address, chain.swapRouter]);
  const address = deployed.address;
  const txHash = deployed.txHash;

  const deployment = {
    address,
    implementation: deployed.implementation,
    upgradeKind: 'proxy',
    implementationContract: 'SwapExecutor',
    agent: agentAddress,
    stable: chain.stable.address,
    router: chain.swapRouter,
    network: chain.name,
    chainId: chain.chainId,
    chain: chain.id,
    timestamp: new Date().toISOString(),
    txHash,
  };
  const file = path.join(__dirname, `../artifacts/SwapExecutor-${chain.chainId}.json`);
  fs.writeFileSync(file, JSON.stringify(deployment, null, 2));
  fs.writeFileSync(
    path.join(__dirname, '../artifacts/SwapExecutor-deployment.json'),
    JSON.stringify(deployment, null, 2)
  );
  console.log('SwapExecutor: ' + address);
  console.log('Set SWAP_EXECUTOR_' + chain.id.toUpperCase() + '=' + address);
  console.log('Upgrade later with: node scripts/upgrade.js SwapExecutor ' + file);
  console.log(chain.explorer + '/tx/' + txHash);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});

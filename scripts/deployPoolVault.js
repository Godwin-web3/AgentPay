require('dotenv').config();
const { ethers } = require('ethers');
const fs = require('fs');
const path = require('path');
const { deployImplementation, deployProxy } = require('./proxyDeploy');

async function main() {
  const provider = new ethers.JsonRpcProvider(process.env.ARC_RPC, { chainId: 5042002, name: 'arc-testnet' });
  const wallet = new ethers.Wallet(process.env.PRIVATE_KEY, provider);

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

  const implementation = await deployImplementation(wallet, 'PoolVault');
  const deployed = await deployProxy(wallet, implementation, 'initialize', [agentAddress, usdcAddress]);
  const contract = deployed.contract;
  const address = deployed.address;
  const txHash = deployed.txHash;
  console.log('✅ PoolVault deployed to: ' + address);
  console.log('🔗 Explorer: https://testnet.arcscan.arc.network/tx/' + txHash);

  let ownershipTransferTxHash = null;
  if (agentAddress.toLowerCase() !== wallet.address.toLowerCase()) {
    console.log('🔐 Handing operational ownership to the agent...');
    console.log('🔐 Upgrade admin stays ' + wallet.address);
    const handoff = await contract.transferOwnership(agentAddress);
    const handoffReceipt = await handoff.wait();
    if (!handoffReceipt || handoffReceipt.status !== 1) {
      throw new Error('Ownership transfer failed. Emergency control is still the deployer.');
    }
    ownershipTransferTxHash = handoff.hash;
  }

  const ownerOnChain = await contract.owner();
  const agentOnChain = await contract.agent();
  if (ownerOnChain.toLowerCase() !== agentAddress.toLowerCase()) {
    throw new Error('Owner on chain is ' + ownerOnChain + ', expected ' + agentAddress);
  }
  if (agentOnChain.toLowerCase() !== agentAddress.toLowerCase()) {
    throw new Error('Agent on chain is ' + agentOnChain + ', expected ' + agentAddress);
  }
  console.log('✅ On-chain owner: ' + ownerOnChain);
  console.log('✅ On-chain agent: ' + agentOnChain);

  fs.writeFileSync(
    path.join(__dirname, '../artifacts/PoolVault-deployment.json'),
    JSON.stringify({
      address,
      implementation: deployed.implementation,
      upgradeKind: 'proxy',
      implementationContract: 'PoolVault',
      deployer: wallet.address,
      agent: agentOnChain,
      owner: ownerOnChain,
      usdc: usdcAddress,
      network: 'Arc Testnet',
      chainId: 5042002,
      timestamp: new Date().toISOString(),
      txHash,
      ownershipTransferTxHash,
      finalOwner: ownerOnChain,
      upgradeAdmin: wallet.address,
    }, null, 2)
  );

  console.log('📝 Saved to artifacts/PoolVault-deployment.json');
  console.log('👉 Add to .env: POOL_VAULT_ADDRESS=' + address);
  console.log('👉 Later logic changes: node scripts/upgrade.js PoolVault');
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});

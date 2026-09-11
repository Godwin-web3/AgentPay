require('dotenv').config();
const { ethers } = require('ethers');
const fs = require('fs');
const path = require('path');
const { getChain } = require('../config/chains');

async function main() {
  const chain = getChain();
  const provider = new ethers.JsonRpcProvider(process.env.ARC_RPC || chain.rpc);
  const wallet = new ethers.Wallet(process.env.PRIVATE_KEY, provider);

  const factoryDeployment = JSON.parse(fs.readFileSync(path.join(__dirname, '../artifacts/VaultFactory-deployment.json'), 'utf8'));
  const factoryAddress = factoryDeployment.address;

  const factoryArtifact = JSON.parse(fs.readFileSync(path.join(__dirname, '../artifacts/VaultFactory.json'), 'utf8'));
  const factory = new ethers.Contract(factoryAddress, factoryArtifact.abi, wallet);

  const target = process.argv[2] || wallet.address;
  console.log('Creating vault for: ' + target);

  const existing = await factory.getVault(target);
  if (existing !== ethers.ZeroAddress) {
    console.log('Vault already exists at: ' + existing);
    return existing;
  }

  const tx = target.toLowerCase() === wallet.address.toLowerCase()
    ? await factory.createVault()
    : await factory.createVaultFor(target);
  console.log('Waiting for transaction: ' + tx.hash);
  await tx.wait();

  const vaultAddress = await factory.getVault(target);
  console.log('Vault created at: ' + vaultAddress);
  return vaultAddress;
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});

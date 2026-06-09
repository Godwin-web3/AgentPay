require('dotenv').config();
const { ethers } = require('ethers');
const fs = require('fs');
const path = require('path');

async function main() {
  const provider = new ethers.JsonRpcProvider(process.env.SOMNIA_RPC_URL);
  const wallet = new ethers.Wallet(process.env.PRIVATE_KEY, provider);

  const factoryDeployment = JSON.parse(fs.readFileSync(path.join(__dirname, '../artifacts/VaultFactory-deployment.json'), 'utf8'));
  const factoryAddress = factoryDeployment.address;

  const factoryArtifact = JSON.parse(fs.readFileSync(path.join(__dirname, '../artifacts/VaultFactory.json'), 'utf8'));
  const factory = new ethers.Contract(factoryAddress, factoryArtifact.abi, wallet);

  console.log('🚀 Creating vault for: ' + wallet.address);
  const tx = await factory.createVault(wallet.address);
  console.log('⏳ Waiting for transaction: ' + tx.hash);
  const receipt = await tx.wait();

  const vaultAddress = await factory.getVault(wallet.address);
  console.log('✅ Vault created at: ' + vaultAddress);

  // Verify bytecode
  const code = await provider.getCode(vaultAddress);
  const selector = '374efb81'; // handleAgentResponse(uint256,Response[],uint8,(uint256,address,address,bytes4,address[],(address,bytes,uint8,uint256,uint256,uint256)[],uint256,uint256,uint256,uint256,uint256,uint8,uint8,uint256,uint256))
  // Wait, let's just check if the hex string contains the selector
  if (code.includes(selector)) {
    console.log('🔍 Verified: handleAgentResponse selector ' + selector + ' found in bytecode.');
  } else {
    console.error('❌ Error: handleAgentResponse selector ' + selector + ' NOT found in bytecode!');
  }

  return vaultAddress;
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});

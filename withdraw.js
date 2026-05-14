require('dotenv').config();
const { ethers } = require('ethers');
const fs = require('fs');
const path = require('path');

const artifact = JSON.parse(fs.readFileSync(path.join(__dirname, 'artifacts/AgentVault.json')));
const VAULT = '0x7E5235C0c711Cf2CA57a18d7BFD79a8cd453793D';

(async () => {
  const provider = new ethers.JsonRpcProvider(process.env.SOMNIA_RPC_URL);
  const wallet = new ethers.Wallet(process.env.PRIVATE_KEY, provider);
  const vault = new ethers.Contract(VAULT, artifact.abi, wallet);

  console.log('Withdrawing 2 STT from vault...');
  const tx = await vault.withdraw(ethers.parseEther('2'));
  await tx.wait();
  console.log('✅ TX:', tx.hash);

  const bal = await provider.getBalance(wallet.address);
  console.log('New wallet balance:', ethers.formatEther(bal), 'STT');
})();

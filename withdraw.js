require('dotenv').config();
const { ethers } = require('ethers');
const fs = require('fs');
const path = require('path');

const artifact = JSON.parse(fs.readFileSync(path.join(__dirname, 'artifacts/AgentVault.json')));
const VAULT = '0x27c9DE593d325EF3C8C7B859b02ec83EEac22602';

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

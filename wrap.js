require('dotenv').config();
const { ethers } = require('ethers');

const WSTT = '0x4A3BC48C156384f9564Fd65A53a2f3D534D8f2b7';
const ABI = ['function deposit() payable', 'function balanceOf(address) view returns (uint256)'];

(async () => {
  const provider = new ethers.JsonRpcProvider(process.env.SOMNIA_RPC_URL);
  const wallet = new ethers.Wallet(process.env.PRIVATE_KEY, provider);
  const wstt = new ethers.Contract(WSTT, ABI, wallet);

  console.log('Wrapping 0.5 STT...');
  const tx = await wstt.deposit({ value: ethers.parseEther('0.5') });
  await tx.wait();
  console.log('TX:', tx.hash);

  const bal = await wstt.balanceOf(wallet.address);
  console.log('WSTT balance:', ethers.formatEther(bal));
})();

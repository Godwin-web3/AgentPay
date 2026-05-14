require('dotenv').config();
const { ethers } = require('ethers');
const fs = require('fs');
const path = require('path');

const WSTT = '0x4A3BC48C156384f9564Fd65A53a2f3D534D8f2b7';
const SUSD = '0x65296738D4E5edB1515e40287B6FDf8320E6eE04';
const deployment = JSON.parse(fs.readFileSync(path.join(__dirname, 'artifacts/dex-deployment.json')));
const ROUTER = deployment.routerAddress;

const ERC20_ABI = [
  'function approve(address spender, uint256 amount) returns (bool)',
  'function balanceOf(address) view returns (uint256)'
];
const ROUTER_ABI = JSON.parse(fs.readFileSync(path.join(__dirname, 'artifacts/SomniaRouter.json'))).abi;

(async () => {
  const provider = new ethers.JsonRpcProvider(process.env.SOMNIA_RPC_URL);
  const wallet = new ethers.Wallet(process.env.PRIVATE_KEY, provider);

  const wstt = new ethers.Contract(WSTT, ERC20_ABI, wallet);
  const susd = new ethers.Contract(SUSD, ERC20_ABI, wallet);
  const router = new ethers.Contract(ROUTER, ROUTER_ABI, wallet);

  const wsttAmount = ethers.parseEther('0.4');
  const susdAmount = ethers.parseEther('400');
  const deadline = Math.floor(Date.now() / 1000) + 60 * 20;

  console.log('Approving WSTT...');
  await (await wstt.approve(ROUTER, wsttAmount)).wait();

  console.log('Approving SUSD...');
  await (await susd.approve(ROUTER, susdAmount)).wait();

  console.log('Adding liquidity WSTT/SUSD...');
  const tx = await router.addLiquidity(
    WSTT, SUSD,
    wsttAmount, susdAmount,
    0, 0,
    wallet.address,
    deadline
  );
  await tx.wait();
  console.log('✅ Pool seeded! TX:', tx.hash);
  console.log('🔗 https://shannon-explorer.somnia.network/tx/' + tx.hash);
})();

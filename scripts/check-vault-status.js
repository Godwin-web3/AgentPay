const { ethers } = require('ethers');
require('dotenv').config();

const VAULT_ADDRESS = '0x4471917E96271F688282ae283d62De0B5Be8084C';
const VAULT_ABI = [
  "function getBalance(address user, address token) external view returns (uint256)",
  "function getPolicy(address user) external view returns (tuple(uint256 perTxCap, uint256 dailyCap, uint256 maxTxPerHour, bool active) policy, address[] memory whitelist)",
  "function getSpendMetrics(address user) external view returns (uint256 todaySpent, uint256 currentHourTx)"
];

async function main() {
  const provider = new ethers.JsonRpcProvider(process.env.SOMNIA_RPC_URL || 'https://dream-rpc.somnia.network');
  const userAddress = '0x58f871DaA82E9e6755a2Cb14f5f07e948a0BcbeA';
  const vault = new ethers.Contract(VAULT_ADDRESS, VAULT_ABI, provider);

  try {
    const balance = await vault.getBalance(userAddress, ethers.ZeroAddress);
    const [policy, whitelist] = await vault.getPolicy(userAddress);
    const [todaySpent, currentHourTx] = await vault.getSpendMetrics(userAddress);

    console.log('--- Vault Status ---');
    console.log('User Address:', userAddress);
    console.log('Vault Balance:', ethers.formatEther(balance), 'STT');
    console.log('Policy:');
    console.log('  Per Tx Cap:', ethers.formatEther(policy.perTxCap), 'STT');
    console.log('  Daily Cap:', ethers.formatEther(policy.dailyCap), 'STT');
    console.log('  Max Tx Per Hour:', policy.maxTxPerHour.toString());
    console.log('  Active:', policy.active);
    console.log('  Whitelist:', whitelist.join(', '));
    console.log('Spend Metrics:');
    console.log('  Today Spent:', ethers.formatEther(todaySpent), 'STT');
    console.log('  Current Hour Tx:', currentHourTx.toString());
  } catch (err) {
    console.error('Error fetching vault status:', err.message);
  }
}

main();

const { ethers } = require('ethers');
const { getChain, getProvider } = require('./chain');
const { vaultAddressFor } = require('./swap');

async function readBasePosition(address) {
  if (!address) return null;
  const chain = getChain('base');
  const vaultAddress = vaultAddressFor(chain);
  if (!vaultAddress) return null;
  const provider = getProvider('base');
  const vault = new ethers.Contract(vaultAddress, ['function balances(address) view returns (uint256)'], provider);
  const stable = new ethers.Contract(chain.stable.address, ['function balanceOf(address) view returns (uint256)'], provider);
  const [inVault, inWallet] = await Promise.all([vault.balances(address), stable.balanceOf(address)]);
  return {
    id: 'base',
    name: chain.name,
    token: chain.stable.symbol,
    vault: ethers.formatUnits(inVault, chain.stable.decimals),
    wallet: ethers.formatUnits(inWallet, chain.stable.decimals),
    vaultAddress,
    address,
  };
}

async function baseDepositHistory(address) {
  const chain = getChain('base');
  const vaultAddress = vaultAddressFor(chain);
  if (!address || !vaultAddress) return [];
  const url = 'https://base-sepolia.blockscout.com/api/v2/addresses/' + address + '/token-transfers';
  const response = await fetch(url, { headers: { accept: 'application/json' } });
  if (!response.ok) return [];
  const data = await response.json();
  const vault = vaultAddress.toLowerCase();
  return (data.items || [])
    .filter((item) => (item.to?.hash || '').toLowerCase() === vault && item.token?.symbol === chain.stable.symbol)
    .map((item) => ({
      type: 'deposit',
      amount: Number(item.total?.value || 0) / 10 ** chain.stable.decimals,
      token: chain.stable.symbol,
      to: vaultAddress,
      txHash: item.transaction_hash,
      timestamp: Date.parse(item.timestamp),
      chain: 'base',
      reason: 'Base Sepolia vault',
    }));
}

module.exports = { readBasePosition, baseDepositHistory };

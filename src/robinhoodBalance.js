const { ethers } = require('ethers');
const { getChain, getProvider } = require('./chain');

const ERC20 = ['function balanceOf(address) view returns (uint256)', 'function approve(address,uint256) returns (bool)'];

function holder() {
  const record = require('./chainRegistry').recall('robinhood-testnet');
  if (record && record.agent) return record.agent;
  return '0x80ea270e071b315AE70aC5DE00B05491FFA98580';
}

async function readRobinhoodPosition() {
  const chain = getChain('robinhood-testnet');
  const address = holder();
  if (!address || !chain.stocks) return null;
  const provider = getProvider(chain.id);
  const tokens = [];
  for (const token of chain.stocks) {
    const contract = new ethers.Contract(token.address, ERC20, provider);
    const balance = await contract.balanceOf(address);
    tokens.push({
      symbol: token.symbol,
      amount: Number(ethers.formatUnits(balance, token.decimals)).toFixed(2),
    });
  }
  let vaultAmount = '0.00';
  const vaultAddress = require('./swap').vaultAddressFor(chain);
  if (vaultAddress) {
    const vault = new ethers.Contract(vaultAddress, ['function balances(address) view returns (uint256)'], provider);
    const credited = await vault.balances(address);
    vaultAmount = Number(ethers.formatUnits(credited, chain.stable.decimals)).toFixed(2);
  }
  const eth = Number(ethers.formatEther(await provider.getBalance(address))).toFixed(4);
  return {
    id: chain.id,
    name: chain.name,
    address,
    eth,
    vault: vaultAmount,
    token: chain.stable.symbol,
    tokens,
    vaultAddress: vaultAddress || null,
  };
}

async function depositStock(amount) {
  const chain = getChain('robinhood-testnet');
  if (!process.env.PRIVATE_KEY) throw new Error('The Robinhood testnet key is not on the server.');
  const vaultAddress = require('./swap').vaultAddressFor(chain);
  if (!vaultAddress) throw new Error('No Robinhood testnet vault yet.');
  const provider = getProvider(chain.id);
  const wallet = new ethers.Wallet(process.env.PRIVATE_KEY, provider);
  const raw = ethers.parseUnits(String(amount), chain.stable.decimals);
  const token = new ethers.Contract(chain.stable.address, ERC20, wallet);
  const balance = await token.balanceOf(wallet.address);
  if (balance < raw) {
    throw new Error('Robinhood wallet holds ' + ethers.formatUnits(balance, chain.stable.decimals) + ' TSLA.');
  }
  const approved = await token.approve(vaultAddress, raw);
  await approved.wait();
  const vault = new ethers.Contract(vaultAddress, ['function deposit(uint256)'], wallet);
  const sent = await vault.deposit(raw);
  const receipt = await sent.wait();
  return { txHash: receipt.hash, vaultAddress };
}

module.exports = { readRobinhoodPosition, depositStock };

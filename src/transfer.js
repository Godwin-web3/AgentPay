const { ethers } = require('ethers');
const { getChain, getProvider } = require('./chain');

const GAS_RESERVE = ethers.parseEther('0.001');

async function sendOnRobinhood({ asset, amount, to }) {
  const chain = getChain('robinhood-testnet');
  if (!chain.testnet || chain.chainId !== 46630) {
    throw new Error('Refusing to send. Robinhood transfers stay on testnet.');
  }
  if (!ethers.isAddress(to)) throw new Error('That recipient is not an address.');
  if (!process.env.PRIVATE_KEY) throw new Error('The Robinhood testnet key is not on the server.');
  const provider = getProvider(chain.id);
  const wallet = new ethers.Wallet(process.env.PRIVATE_KEY, provider);
  const symbol = String(asset || '').toUpperCase();

  if (symbol === 'ETH') {
    const raw = ethers.parseEther(String(amount));
    const balance = await provider.getBalance(wallet.address);
    if (balance < raw + GAS_RESERVE) {
      throw new Error('Not enough ETH. ' + ethers.formatEther(GAS_RESERVE) + ' stays behind for gas.');
    }
    const sent = await wallet.sendTransaction({ to, value: raw });
    const receipt = await sent.wait();
    return { txHash: receipt.hash, token: 'ETH', explorer: chain.explorer + '/tx/' + receipt.hash };
  }

  const listed = [...(chain.stocks || [])];
  if (chain.usdg) listed.push(chain.usdg);
  const token = listed.find((item) => item.symbol === symbol);
  if (!token) throw new Error(symbol + ' is not held on Robinhood testnet.');
  const raw = ethers.parseUnits(String(amount), token.decimals);
  const erc20 = new ethers.Contract(token.address, [
    'function balanceOf(address) view returns (uint256)',
    'function transfer(address,uint256) returns (bool)',
  ], wallet);
  const balance = await erc20.balanceOf(wallet.address);
  if (balance < raw) throw new Error('Not enough ' + symbol + '.');
  const sent = await erc20.transfer(to, raw);
  const receipt = await sent.wait();
  return { txHash: receipt.hash, token: symbol, explorer: chain.explorer + '/tx/' + receipt.hash };
}

async function mintTestUsdg(amount) {
  const chain = getChain('robinhood-testnet');
  if (!chain.testnet || chain.chainId !== 46630) throw new Error('Refusing to mint. USDG stays on Robinhood testnet.');
  if (!chain.usdg) throw new Error('No test USDG on this chain.');
  if (!process.env.PRIVATE_KEY) throw new Error('The Robinhood testnet key is not on the server.');
  const whole = Number(amount || 1000);
  if (!Number.isFinite(whole) || whole <= 0 || whole > 100000) throw new Error('Mint between 1 and 100000 test USDG.');
  const provider = getProvider(chain.id);
  const wallet = new ethers.Wallet(process.env.PRIVATE_KEY, provider);
  const token = new ethers.Contract(chain.usdg.address, ['function mint(address,uint256)'], wallet);
  const raw = ethers.parseUnits(String(whole), chain.usdg.decimals);
  const sent = await token.mint(wallet.address, raw);
  const receipt = await sent.wait();
  return { txHash: receipt.hash, amount: String(whole), explorer: chain.explorer + '/tx/' + receipt.hash };
}

module.exports = { sendOnRobinhood, mintTestUsdg };

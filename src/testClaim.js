const { ethers } = require('ethers');
const { getChain, getProvider } = require('./chain');

const USDG_AMOUNT = '1000';
const HOOD_ETH = '0.0003';
const HOOD_RESERVE = '0.003';
const BASE_ETH = '0.0002';
const BASE_RESERVE = '0.002';
const ARC_NATIVE = '1';
const ARC_RESERVE = '5';

function signer(chainId) {
  if (!process.env.PRIVATE_KEY) throw new Error('The testnet key is not on the server.');
  return new ethers.Wallet(process.env.PRIVATE_KEY, getProvider(chainId));
}

async function claimTestnet(to) {
  if (!ethers.isAddress(to)) throw new Error('No wallet to fund.');
  const landed = [];
  const skipped = [];

  const hood = getChain('robinhood-testnet');
  if (!hood.testnet) throw new Error('Refusing to fund. Robinhood is not on testnet.');
  const hoodSigner = signer(hood.id);
  try {
    const token = new ethers.Contract(hood.usdg.address, ['function mint(address,uint256)'], hoodSigner);
    const minted = await token.mint(to, ethers.parseUnits(USDG_AMOUNT, hood.usdg.decimals));
    await minted.wait();
    landed.push(USDG_AMOUNT + ' test USDG on Robinhood');
  } catch (err) {
    skipped.push('Test USDG: ' + (err.shortMessage || err.message));
  }

  try {
    const balance = await getProvider(hood.id).getBalance(hoodSigner.address);
    const reserve = ethers.parseEther(HOOD_RESERVE);
    const drip = ethers.parseEther(HOOD_ETH);
    if (balance < reserve + drip) {
      skipped.push('Robinhood gas: the faucet wallet is low');
    } else {
      const sent = await hoodSigner.sendTransaction({ to, value: drip });
      await sent.wait();
      landed.push(HOOD_ETH + ' ETH on Robinhood');
    }
  } catch (err) {
    skipped.push('Robinhood gas: ' + (err.shortMessage || err.message));
  }

  const base = getChain('base');
  if (base.testnet) {
    try {
      const baseSigner = signer(base.id);
      const balance = await getProvider(base.id).getBalance(baseSigner.address);
      const drip = ethers.parseEther(BASE_ETH);
      if (balance < ethers.parseEther(BASE_RESERVE) + drip) {
        skipped.push('Base gas: the faucet wallet is low');
      } else {
        const sent = await baseSigner.sendTransaction({ to, value: drip });
        await sent.wait();
        landed.push(BASE_ETH + ' ETH on Base Sepolia');
      }
    } catch (err) {
      skipped.push('Base gas: ' + (err.shortMessage || err.message));
    }
  }

  const arc = getChain('arc');
  if (arc.testnet) {
    try {
      const arcSigner = signer(arc.id);
      const balance = await getProvider(arc.id).getBalance(arcSigner.address);
      const drip = ethers.parseEther(ARC_NATIVE);
      if (balance < ethers.parseEther(ARC_RESERVE) + drip) {
        skipped.push('Arc gas: the faucet wallet is low');
      } else {
        const sent = await arcSigner.sendTransaction({ to, value: drip });
        await sent.wait();
        landed.push(ARC_NATIVE + ' on Arc testnet');
      }
    } catch (err) {
      skipped.push('Arc gas: ' + (err.shortMessage || err.message));
    }
  }

  skipped.push('Stock tokens and Base USDC have no open mint.');
  if (!landed.length) throw new Error(skipped[0] || 'Nothing could be claimed.');
  return { landed, skipped };
}

module.exports = { claimTestnet };

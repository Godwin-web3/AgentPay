// USDC bridge via Circle CCTP V2. Burns on the source chain and mints the
// same amount on the destination. Only chains with a cctp record are routes.
// Funds leave the chain wallet, not the vault.

const { ethers } = require('ethers');
const { getChain } = require('./chain');
const walletService = require('./walletService');
const walletStore = require('./walletStore');

const MESSENGER = 'depositForBurn(uint256,uint32,bytes32,address,bytes32,uint256,uint32)';
const RECEIVE = 'receiveMessage(bytes,bytes)';
const FAST = '1000';
const IRIS = 'https://iris-api-sandbox.circle.com';

function route(fromName, toName) {
  let from;
  let to;
  try {
    from = getChain(fromName);
    to = getChain(toName);
  } catch (err) {
    throw new Error(err.message);
  }
  if (!from.testnet || !to.testnet) {
    throw new Error('Bridge stays on testnet. Use Base Sepolia and Arc Testnet.');
  }
  if (from.id === to.id) throw new Error('Pick two different chains.');
  if (!from.cctp || !to.cctp) {
    throw new Error('Bridge is USDC between Base Sepolia and Arc Testnet only.');
  }
  return { from, to };
}

async function fastFee(from, to, amountRaw) {
  const res = await fetch(`${IRIS}/v2/burn/USDC/fees/${from.cctp.domain}/${to.cctp.domain}`);
  if (!res.ok) throw new Error('Could not price the fast bridge.');
  const fees = await res.json();
  const row = (Array.isArray(fees) ? fees : []).find((item) => item.finalityThreshold === 1000);
  if (!row) throw new Error('Fast transfer is not available on this route.');
  const bps = Number(row.minimumFee);
  if (!Number.isFinite(bps) || bps < 0) throw new Error('Fast transfer fee was unreadable.');
  const raw = BigInt(amountRaw);
  const real = (raw * BigInt(Math.ceil(bps * 10))) / 100000n;
  const maxFee = real * 2n < 1n ? 1n : real * 2n;
  if (maxFee >= raw) throw new Error('The fast fee is larger than the amount.');
  return { bps, real, maxFee };
}

async function quoteBridge({ from, to, amount }) {
  const pair = route(from || 'base', to || 'arc');
  const amountIn = Number(amount);
  if (!Number.isFinite(amountIn) || amountIn <= 0) throw new Error('Amount must be greater than zero.');
  const raw = units(pair.from, amountIn);
  const priced = await fastFee(pair.from, pair.to, raw);
  const fee = ethers.formatUnits(priced.real, pair.from.stable.decimals);
  const amountOut = ethers.formatUnits(BigInt(raw) - priced.real, pair.from.stable.decimals);
  return {
    from: pair.from.id,
    to: pair.to.id,
    fromName: pair.from.name,
    toName: pair.to.name,
    amount: String(amountIn),
    amountOut,
    token: 'USDC',
    fee,
    maxFee: priced.maxFee.toString(),
    speed: 'fast',
  };
}

function units(chain, amount) {
  return ethers.parseUnits(String(amount), chain.stable.decimals).toString();
}

function padAddress(address) {
  return ethers.zeroPadValue(address, 32);
}

async function attestation(domain, txHash) {
  const url = `${IRIS}/v2/messages/${domain}?transactionHash=${txHash}`;
  const res = await fetch(url);
  if (!res.ok) return null;
  const body = await res.json();
  const msg = body.messages && body.messages[0];
  if (!msg || msg.status !== 'complete' || !msg.message || !msg.attestation) return null;
  if (msg.attestation === 'PENDING') return null;
  return msg;
}

async function waitForAttestation(domain, txHash) {
  for (let i = 0; i < 6; i++) {
    const msg = await attestation(domain, txHash);
    if (msg) return msg;
    await new Promise((r) => setTimeout(r, 3000));
  }
  return null;
}

async function signerFor(userId, chain) {
  const record = await walletStore.getWallet(userId);
  if (!record || !record.walletId) throw new Error('No wallet yet.');
  if (!chain.circle || chain.circle === 'ARC-TESTNET') return record;
  const saved = record.chainWallets && record.chainWallets[chain.id];
  if (saved && saved.walletId) return { ...record, walletId: saved.walletId, address: saved.address };
  const created = await walletService.createWalletOnChain(chain.circle);
  const chainWallets = { ...(record.chainWallets || {}), [chain.id]: created };
  await walletStore.setWallet(userId, { chainWallets });
  return { walletId: created.walletId, address: created.address };
}

async function mint(userId, pending, msg) {
  const dest = getChain(pending.toChain);
  const destWallet = await signerFor(userId, dest);
  const mintTx = await walletService.runContract(
    destWallet.walletId,
    dest.circle,
    dest.cctp.messageTransmitter,
    RECEIVE,
    [msg.message, msg.attestation]
  );
  await walletStore.setWallet(userId, { pendingBridge: null });
  return mintTx;
}

async function executeBridge({ userId, from, to, amount }) {
  const quoted = await quoteBridge({ from, to, amount });
  const source = getChain(quoted.from);
  const dest = getChain(quoted.to);
  const sourceWallet = await signerFor(userId, source);
  const destWallet = await signerFor(userId, dest);
  const raw = units(source, quoted.amount);
  await walletService.runContract(
    sourceWallet.walletId,
    source.circle,
    source.stable.address,
    'approve(address,uint256)',
    [source.cctp.tokenMessenger, raw]
  );
  const burnTx = await walletService.runContract(
    sourceWallet.walletId,
    source.circle,
    source.cctp.tokenMessenger,
    MESSENGER,
    [raw, String(dest.cctp.domain), padAddress(destWallet.address), source.stable.address, ethers.ZeroHash, quoted.maxFee, FAST]
  );
  const pending = {
    burnTx,
    fromChain: source.id,
    toChain: dest.id,
    amount: quoted.amount,
    domain: source.cctp.domain,
  };
  await walletStore.setWallet(userId, { pendingBridge: pending });
  const msg = await waitForAttestation(source.cctp.domain, burnTx);
  if (!msg) {
    return { success: true, status: 'burned', burnTx, quote: quoted };
  }
  const mintTx = await mint(userId, pending, msg);
  return { success: true, status: 'complete', burnTx, mintTx, quote: quoted };
}

async function completeBridge(userId) {
  const record = await walletStore.getWallet(userId);
  const pending = record && record.pendingBridge;
  if (!pending || !pending.burnTx) throw new Error('No bridge is waiting. Start one from the chat.');
  const msg = await attestation(pending.domain, pending.burnTx);
  if (!msg) throw new Error('Circle has not attested the burn yet. Try again in a minute.');
  const mintTx = await mint(userId, pending, msg);
  return { success: true, status: 'complete', burnTx: pending.burnTx, mintTx, amount: pending.amount, fromChain: pending.fromChain, toChain: pending.toChain };
}

async function resumePendingBridges() {
  const wallets = await walletStore.getAllWallets();
  for (const [userId, record] of Object.entries(wallets)) {
    if (!record.pendingBridge || !record.pendingBridge.burnTx) continue;
    try {
      const done = await completeBridge(userId);
      console.log('[bridge] minted', done.mintTx);
      try {
        const { appendSpend } = require('./spendStore');
        await appendSpend({
          userAddress: userId,
          to: done.toChain,
          amount: Number(done.amount),
          reason: `Minted on ${done.toChain}`,
          txHash: done.mintTx,
          token: 'USDC',
          type: 'bridge',
        });
      } catch (err) {
        console.error('[bridge] history', err.message);
      }
    } catch (err) {
      if (!/not attested/i.test(err.message)) console.error('[bridge] resume', err.message);
    }
  }
}

function watchBridges() {
  const tick = () => resumePendingBridges().catch((err) => console.error('[bridge]', err.message));
  setTimeout(tick, 20000);
  setInterval(tick, 60000);
}

module.exports = { quoteBridge, executeBridge, completeBridge, watchBridges };

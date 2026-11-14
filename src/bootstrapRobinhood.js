// Deploys AgentVault on Robinhood Chain testnet once.
// Refuses Robinhood mainnet. There is no Uniswap router here, so no swap
// executor is deployed and no swap can settle.

const { ethers } = require('ethers');
const { getChain, getProvider } = require('./chain');
const registry = require('./chainRegistry');
const { deployUpgradeable } = require('./bootstrapBase');

const CHAIN_KEY = 'robinhood-testnet';
const MIN_ETH = '0.0003';

async function bootstrapRobinhood() {
  if (process.env.BOOTSTRAP_ROBINHOOD === '0') {
    return registry.remember(CHAIN_KEY, { status: 'disabled' });
  }

  const chain = getChain(CHAIN_KEY);
  if (!chain.testnet || chain.chainId !== 46630) {
    return registry.remember(CHAIN_KEY, {
      status: 'skipped',
      reason: 'Refusing to deploy. Robinhood bootstrap is testnet chain id 46630 only.',
    });
  }

  const provider = getProvider(CHAIN_KEY);
  const wanted = chain.stable.address.toLowerCase();

  async function holdsWanted(address) {
    if (!address) return false;
    try {
      const current = await new ethers.Contract(address, ['function usdc() view returns (address)'], provider).usdc();
      return String(current).toLowerCase() === wanted;
    } catch (_) {
      return false;
    }
  }

  const pinned = process.env.VAULT_ADDRESS_ROBINHOOD_TESTNET;
  if (pinned && await holdsWanted(pinned)) {
    return registry.remember(CHAIN_KEY, {
      status: 'deployed',
      vault: pinned,
      executor: null,
      executorSkipped: true,
      token: chain.stable.address,
      tokenSymbol: chain.stable.symbol,
      source: 'env',
    });
  }

  try {
    const stored = await registry.load(CHAIN_KEY);
    if (stored && stored.vault && await holdsWanted(stored.vault)) {
      console.log('[robinhood-testnet] using stored vault ' + stored.vault);
      return stored;
    }
    if (stored && stored.vault) {
      console.log('[robinhood-testnet] stored vault does not hold test USDG. Deploying a new one.');
      await registry.save(CHAIN_KEY, { status: 'replaced', vault: null, executor: null, executorSkipped: false, previousVault: stored.vault });
    }
  } catch (err) {
    console.error('[robinhood-testnet] could not read stored deployment:', err.message);
  }

  if (!process.env.PRIVATE_KEY) {
    return registry.remember(CHAIN_KEY, { status: 'skipped', reason: 'PRIVATE_KEY is not set on the server' });
  }
  if (!registry.firebaseReady()) {
    return registry.remember(CHAIN_KEY, { status: 'skipped', reason: 'Firestore is not configured, so a deploy would repeat on every restart' });
  }

  const wallet = new ethers.Wallet(process.env.PRIVATE_KEY, provider);
  let balance;
  try {
    balance = await provider.getBalance(wallet.address);
  } catch (err) {
    return registry.remember(CHAIN_KEY, { status: 'skipped', reason: 'Robinhood testnet RPC failed: ' + err.message });
  }

  const min = ethers.parseEther(MIN_ETH);
  if (balance < min) {
    const reason = wallet.address + ' has ' + ethers.formatEther(balance) + ' ETH on Robinhood testnet. Need at least ' + MIN_ETH + '. No funds were moved.';
    console.log('[robinhood-testnet] ' + reason);
    return registry.remember(CHAIN_KEY, { status: 'no-gas', address: wallet.address, balance: ethers.formatEther(balance), reason });
  }

  let claim;
  try {
    claim = await registry.claim(CHAIN_KEY);
  } catch (err) {
    return registry.remember(CHAIN_KEY, { status: 'skipped', reason: 'Could not lock the deploy: ' + err.message });
  }
  if (!claim.won) {
    console.log('[robinhood-testnet] deploy already running or finished');
    return registry.recall(CHAIN_KEY);
  }

  try {
    const prior = registry.recall(CHAIN_KEY) || {};
    let vaultAddress = null;
    let vaultTx = null;
    if (await holdsWanted(prior.vault)) {
      vaultAddress = prior.vault;
      vaultTx = prior.vaultTx || null;
    }
    if (!vaultAddress) {
      console.log('[robinhood-testnet] deploying vault from ' + wallet.address);
      const vault = await deployUpgradeable(wallet, 'AgentVault', [wallet.address, chain.stable.address]);
      vaultAddress = vault.address;
      vaultTx = vault.txHash;
      prior.vaultImplementation = vault.implementation;
      prior.upgradeKind = 'proxy';
    }
    const record = await registry.save(CHAIN_KEY, {
      status: 'deployed',
      vault: vaultAddress,
      vaultTx,
      vaultImplementation: prior.vaultImplementation || null,
      upgradeKind: prior.upgradeKind || null,
      executor: null,
      executorSkipped: true,
      reason: 'No Uniswap router on Robinhood testnet, so the swap contract was not deployed.',
      agent: wallet.address,
      chainId: chain.chainId,
      token: chain.stable.address,
      tokenSymbol: chain.stable.symbol,
      deployedAt: new Date().toISOString(),
    });
    console.log('[robinhood-testnet] vault ' + vaultAddress);
    return record;
  } catch (err) {
    const reason = err.shortMessage || err.message;
    console.error('[robinhood-testnet] deploy failed:', reason);
    return registry.save(CHAIN_KEY, { status: 'failed', reason, failedAt: new Date().toISOString() });
  }
}

let running = false;
let timer = null;

function watchRobinhood() {
  if (running) return;
  running = true;
  bootstrapRobinhood()
    .then((record) => {
      if (record && (record.status === 'deployed' || record.status === 'disabled')) return;
      if (!timer) {
        timer = setTimeout(() => {
          timer = null;
          watchRobinhood();
        }, 10 * 60 * 1000);
      }
    })
    .catch((err) => {
      console.error('[robinhood-testnet] bootstrap failed:', err.message);
      if (!timer) {
        timer = setTimeout(() => {
          timer = null;
          watchRobinhood();
        }, 10 * 60 * 1000);
      }
    })
    .finally(() => {
      running = false;
    });
}

module.exports = { bootstrapRobinhood, watchRobinhood };

// Deploys AgentVault and SwapExecutor on Base once, using the key already
// on the server. Skips if there is no gas, no key, or a deployment already
// stored. Never touches the Arc vault.

const fs = require('fs');
const path = require('path');
const { ethers } = require('ethers');
const { getChain, getProvider } = require('./chain');
const registry = require('./chainRegistry');

const MIN_ETH = '0.0008';

function readArtifact(name) {
  const file = path.join(__dirname, '../artifacts', name + '.json');
  if (!fs.existsSync(file)) throw new Error(name + ' artifact missing. Run node scripts/compile.js');
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

async function deployContract(wallet, artifact, args) {
  const factory = new ethers.ContractFactory(artifact.abi, artifact.bytecode, wallet);
  const contract = await factory.deploy(...args);
  await contract.waitForDeployment();
  return {
    address: await contract.getAddress(),
    txHash: contract.deploymentTransaction().hash,
  };
}

async function bootstrapBase() {
  if (process.env.BOOTSTRAP_BASE === '0') {
    registry.remember('base', { status: 'disabled' });
    return registry.recall('base');
  }

  if (process.env.VAULT_ADDRESS_BASE && process.env.SWAP_EXECUTOR_BASE) {
    return registry.remember('base', {
      status: 'deployed',
      vault: process.env.VAULT_ADDRESS_BASE,
      executor: process.env.SWAP_EXECUTOR_BASE,
      source: 'env',
    });
  }

  try {
    const stored = await registry.load('base');
    if (stored && stored.status === 'deployed' && stored.vault && stored.executor) {
      console.log('[base] using stored vault ' + stored.vault);
      return stored;
    }
  } catch (err) {
    console.error('[base] could not read stored deployment:', err.message);
  }

  if (!process.env.PRIVATE_KEY) {
    return registry.remember('base', { status: 'skipped', reason: 'PRIVATE_KEY is not set on the server' });
  }
  if (!registry.firebaseReady()) {
    return registry.remember('base', { status: 'skipped', reason: 'Firestore is not configured, so a deploy would repeat on every restart' });
  }

  const chain = getChain('base');
  const provider = getProvider('base');
  const wallet = new ethers.Wallet(process.env.PRIVATE_KEY, provider);
  let balance;
  try {
    balance = await provider.getBalance(wallet.address);
  } catch (err) {
    return registry.remember('base', { status: 'skipped', reason: 'Base RPC failed: ' + err.message });
  }

  const min = ethers.parseEther(MIN_ETH);
  if (balance < min) {
    const reason = wallet.address + ' has ' + ethers.formatEther(balance) + ' ETH on Base. Need at least ' + MIN_ETH + ' to deploy. No funds were moved.';
    console.log('[base] ' + reason);
    return registry.remember('base', { status: 'no-gas', address: wallet.address, balance: ethers.formatEther(balance), reason });
  }

  let claim;
  try {
    claim = await registry.claim('base');
  } catch (err) {
    return registry.remember('base', { status: 'skipped', reason: 'Could not lock the deploy: ' + err.message });
  }
  if (!claim.won) {
    console.log('[base] deploy already running or finished');
    return registry.recall('base');
  }

  try {
    console.log('[base] deploying from ' + wallet.address);
    const stored = registry.recall('base') || {};
    let vaultAddress = stored.vault || null;
    let vaultTx = stored.vaultTx || null;
    let executorAddress = stored.executor || null;
    let executorTx = stored.executorTx || null;

    if (!vaultAddress) {
      const vaultArtifact = readArtifact('AgentVault');
      const vault = await deployContract(wallet, vaultArtifact, [wallet.address, chain.stable.address]);
      vaultAddress = vault.address;
      vaultTx = vault.txHash;
      await registry.save('base', { status: 'deploying', vault: vaultAddress, vaultTx, agent: wallet.address, chainId: chain.chainId });
    }
    if (!executorAddress) {
      const executorArtifact = readArtifact('SwapExecutor');
      const executor = await deployContract(wallet, executorArtifact, [wallet.address, chain.stable.address, chain.swapRouter]);
      executorAddress = executor.address;
      executorTx = executor.txHash;
    }
    const record = await registry.save('base', {
      status: 'deployed',
      vault: vaultAddress,
      executor: executorAddress,
      vaultTx,
      executorTx,
      agent: wallet.address,
      chainId: chain.chainId,
      deployedAt: new Date().toISOString(),
      reason: null,
    });
    console.log('[base] vault ' + vaultAddress);
    console.log('[base] executor ' + executorAddress);
    return record;
  } catch (err) {
    const reason = err.shortMessage || err.message;
    console.error('[base] deploy failed:', reason);
    return registry.save('base', { status: 'failed', reason, failedAt: new Date().toISOString() });
  }
}

module.exports = { bootstrapBase, MIN_ETH };

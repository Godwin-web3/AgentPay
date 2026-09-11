const { expect } = require('chai');
const { ethers } = require('hardhat');

async function signExecute(vault, signer, { user, to, amount, requestId, deadline }) {
  const nonce = await vault.getNonce(user);
  const domain = {
    name: 'AgentVault',
    version: '1',
    chainId: (await ethers.provider.getNetwork()).chainId,
    verifyingContract: await vault.getAddress()
  };
  const types = {
    ExecuteWithSig: [
      { name: 'user', type: 'address' },
      { name: 'to', type: 'address' },
      { name: 'amount', type: 'uint256' },
      { name: 'requestId', type: 'bytes32' },
      { name: 'nonce', type: 'uint256' },
      { name: 'deadline', type: 'uint256' }
    ]
  };
  const value = { user, to, amount, requestId, nonce, deadline };
  const sigHex = await signer.signTypedData(domain, types, value);
  const { v, r, s } = ethers.Signature.from(sigHex);
  return ethers.concat([r, s, ethers.toBeArray(v)]);
}

describe('AgentVault - attack survival', function () {
  let usdc, vault, owner, user, agent, legit, attacker, guardian;

  beforeEach(async function () {
    [owner, user, agent, legit, attacker, guardian] = await ethers.getSigners();

    const MockUSDC = await ethers.getContractFactory('MockUSDC');
    usdc = await MockUSDC.deploy();
    await usdc.waitForDeployment();

    const AgentVault = await ethers.getContractFactory('AgentVault');
    vault = await AgentVault.deploy(owner.address, agent.address, await usdc.getAddress(), guardian.address);
    await vault.waitForDeployment();

    await usdc.mint(user.address, ethers.parseUnits('1000', 6));
    await usdc.connect(user).approve(await vault.getAddress(), ethers.parseUnits('1000', 6));
    await vault.connect(user).deposit(ethers.parseUnits('1000', 6));

    await vault.connect(user).setPolicy(
      ethers.parseUnits('50', 6),
      ethers.parseUnits('100', 6),
      3,
      [legit.address]
    );
  });

  it('records the constructor owner and guardian, not the factory as owner', async function () {
    expect(await vault.owner()).to.equal(owner.address);
    expect(await vault.guardian()).to.equal(guardian.address);
    expect(await vault.agent()).to.equal(agent.address);
  });

  it('executes a legitimate whitelisted payment within caps', async function () {
    await expect(
      vault.connect(agent).execute(user.address, legit.address, ethers.parseUnits('20', 6), 'rent', ethers.ZeroHash)
    ).to.emit(vault, 'Executed');
    expect(await vault.getBalance(user.address)).to.equal(ethers.parseUnits('980', 6));
  });

  it('REJECTS a payment to a non-whitelisted address even if the agent key requests it', async function () {
    await expect(
      vault.connect(agent).execute(user.address, attacker.address, ethers.parseUnits('10', 6), 'malicious redirect', ethers.ZeroHash)
    ).to.be.revertedWithCustomError(vault, 'NotWhitelisted');
    expect(await vault.getBalance(user.address)).to.equal(ethers.parseUnits('1000', 6));
  });

  it('REJECTS a single payment above the per-tx cap', async function () {
    await expect(
      vault.connect(agent).execute(user.address, legit.address, ethers.parseUnits('51', 6), 'try to drain', ethers.ZeroHash)
    ).to.be.revertedWithCustomError(vault, 'ExceedsPerTxCap');
  });

  it('REJECTS payments once the daily cap is hit, even split across many small transactions', async function () {
    await vault.connect(agent).execute(user.address, legit.address, ethers.parseUnits('40', 6), 'p1', ethers.ZeroHash);
    await vault.connect(agent).execute(user.address, legit.address, ethers.parseUnits('40', 6), 'p2', ethers.ZeroHash);
    await expect(
      vault.connect(agent).execute(user.address, legit.address, ethers.parseUnits('30', 6), 'p3 over cap', ethers.ZeroHash)
    ).to.be.revertedWithCustomError(vault, 'ExceedsDailyCap');
  });

  it('REJECTS bursts of transactions beyond the hourly velocity limit', async function () {
    await vault.connect(agent).execute(user.address, legit.address, ethers.parseUnits('1', 6), 't1', ethers.ZeroHash);
    await vault.connect(agent).execute(user.address, legit.address, ethers.parseUnits('1', 6), 't2', ethers.ZeroHash);
    await vault.connect(agent).execute(user.address, legit.address, ethers.parseUnits('1', 6), 't3', ethers.ZeroHash);
    await expect(
      vault.connect(agent).execute(user.address, legit.address, ethers.parseUnits('1', 6), 't4 too fast', ethers.ZeroHash)
    ).to.be.revertedWithCustomError(vault, 'ExceedsHourlyVelocity');
  });

  it('REJECTS any execute() call from an address that is not the agent key', async function () {
    await expect(
      vault.connect(attacker).execute(user.address, legit.address, ethers.parseUnits('1', 6), 'not the agent', ethers.ZeroHash)
    ).to.be.revertedWithCustomError(vault, 'NotAgent');
  });

  it('lets the owner pause a user, blocking further execution regardless of policy', async function () {
    await vault.connect(owner).pauseUser(user.address);
    await expect(
      vault.connect(agent).execute(user.address, legit.address, ethers.parseUnits('1', 6), 'p', ethers.ZeroHash)
    ).to.be.revertedWithCustomError(vault, 'UserPausedError');
  });

  it('lets the guardian pause a user without being able to execute', async function () {
    await vault.connect(guardian).pauseUser(user.address);
    await expect(
      vault.connect(agent).execute(user.address, legit.address, ethers.parseUnits('1', 6), 'p', ethers.ZeroHash)
    ).to.be.revertedWithCustomError(vault, 'UserPausedError');
    await expect(
      vault.connect(guardian).execute(user.address, legit.address, ethers.parseUnits('1', 6), 'p', ethers.ZeroHash)
    ).to.be.revertedWithCustomError(vault, 'NotAgent');
  });

  it('rejects pause from a random address', async function () {
    await expect(
      vault.connect(attacker).pauseUser(user.address)
    ).to.be.revertedWithCustomError(vault, 'NotGuardian');
  });

  it('executeWithSig accepts an agent signature submitted by anyone', async function () {
    const deadline = BigInt(Math.floor(Date.now() / 1000) + 600);
    const amount = ethers.parseUnits('5', 6);
    const sig = await signExecute(vault, agent, {
      user: user.address, to: legit.address, amount, requestId: ethers.ZeroHash, deadline
    });
    await expect(
      vault.connect(attacker).executeWithSig(user.address, legit.address, amount, ethers.ZeroHash, deadline, sig)
    ).to.emit(vault, 'Executed');
  });

  it('executeWithSig REJECTS a user signature', async function () {
    const deadline = BigInt(Math.floor(Date.now() / 1000) + 600);
    const amount = ethers.parseUnits('5', 6);
    const sig = await signExecute(vault, user, {
      user: user.address, to: legit.address, amount, requestId: ethers.ZeroHash, deadline
    });
    await expect(
      vault.connect(attacker).executeWithSig(user.address, legit.address, amount, ethers.ZeroHash, deadline, sig)
    ).to.be.revertedWithCustomError(vault, 'InvalidSignature');
  });

  it('executeWithUserSig accepts a user signature and still enforces policy', async function () {
    const deadline = BigInt(Math.floor(Date.now() / 1000) + 600);
    const amount = ethers.parseUnits('5', 6);
    const sig = await signExecute(vault, user, {
      user: user.address, to: legit.address, amount, requestId: ethers.ZeroHash, deadline
    });
    await expect(
      vault.connect(attacker).executeWithUserSig(user.address, legit.address, amount, ethers.ZeroHash, deadline, sig)
    ).to.emit(vault, 'Executed');

    const badAmount = ethers.parseUnits('51', 6);
    const badSig = await signExecute(vault, user, {
      user: user.address, to: legit.address, amount: badAmount, requestId: ethers.ZeroHash, deadline
    });
    await expect(
      vault.connect(attacker).executeWithUserSig(user.address, legit.address, badAmount, ethers.ZeroHash, deadline, badSig)
    ).to.be.revertedWithCustomError(vault, 'ExceedsPerTxCap');
  });
});

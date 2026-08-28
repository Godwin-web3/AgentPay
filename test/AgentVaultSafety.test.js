const { expect } = require('chai');
const { ethers } = require('hardhat');

/**
 * Proves, against a real local EVM (not a mock), that AgentVault's on-chain
 * policy is what actually stops an overspend — not the off-chain AI. Every
 * "attack" here is a call the AI agent key COULD make if it were tricked
 * (prompt injection, a bad LLM decision, a compromised backend process) into
 * asking for something outside the user's policy. The vault must reject all
 * of them while leaving the legitimate payment untouched.
 */
describe('AgentVault — attack survival', function () {
  let usdc, vault, owner, user, agent, legit, attacker;

  beforeEach(async function () {
    [owner, user, agent, legit, attacker] = await ethers.getSigners();

    const MockUSDC = await ethers.getContractFactory('MockUSDC');
    usdc = await MockUSDC.deploy();
    await usdc.waitForDeployment();

    const AgentVault = await ethers.getContractFactory('AgentVault');
    vault = await AgentVault.deploy(agent.address, await usdc.getAddress());
    await vault.waitForDeployment();

    await usdc.mint(user.address, ethers.parseUnits('1000', 6));
    await usdc.connect(user).approve(await vault.getAddress(), ethers.parseUnits('1000', 6));
    await vault.connect(user).deposit(ethers.parseUnits('1000', 6));

    // perTxCap 50, dailyCap 100, maxTxPerHour 3, whitelist = [legit]
    await vault.connect(user).setPolicy(
      ethers.parseUnits('50', 6),
      ethers.parseUnits('100', 6),
      3,
      [legit.address]
    );
  });

  it('executes a legitimate whitelisted payment within caps', async function () {
    await expect(
      vault.connect(agent).execute(user.address, legit.address, ethers.parseUnits('20', 6), 'rent', ethers.ZeroHash)
    ).to.emit(vault, 'Executed');

    expect(await vault.getBalance(user.address)).to.equal(ethers.parseUnits('980', 6));
    expect(await usdc.balanceOf(legit.address)).to.equal(ethers.parseUnits('20', 6));
  });

  it('REJECTS a payment to a non-whitelisted address even if the agent key requests it', async function () {
    // Simulates: prompt injection / a hijacked LLM decision tries to redirect
    // funds to an attacker address. The agent key itself issues the call —
    // exactly what would happen if the off-chain AI were fully compromised.
    await expect(
      vault.connect(agent).execute(user.address, attacker.address, ethers.parseUnits('10', 6), 'malicious redirect', ethers.ZeroHash)
    ).to.be.revertedWithCustomError(vault, 'NotWhitelisted');

    expect(await vault.getBalance(user.address)).to.equal(ethers.parseUnits('1000', 6));
  });

  it('REJECTS a single payment above the per-tx cap', async function () {
    await expect(
      vault.connect(agent).execute(user.address, legit.address, ethers.parseUnits('51', 6), 'try to drain', ethers.ZeroHash)
    ).to.be.revertedWithCustomError(vault, 'ExceedsPerTxCap');

    expect(await vault.getBalance(user.address)).to.equal(ethers.parseUnits('1000', 6));
  });

  it('REJECTS payments once the daily cap is hit, even split across many small transactions', async function () {
    // 2 legit-sized payments (40 + 40 = 80) succeed, a 3rd of 30 would push
    // total to 110 > dailyCap of 100 and must revert — no way to "salami
    // slice" around the daily limit.
    await vault.connect(agent).execute(user.address, legit.address, ethers.parseUnits('40', 6), 'p1', ethers.ZeroHash);
    await vault.connect(agent).execute(user.address, legit.address, ethers.parseUnits('40', 6), 'p2', ethers.ZeroHash);

    await expect(
      vault.connect(agent).execute(user.address, legit.address, ethers.parseUnits('30', 6), 'p3 over cap', ethers.ZeroHash)
    ).to.be.revertedWithCustomError(vault, 'ExceedsDailyCap');

    expect(await vault.getBalance(user.address)).to.equal(ethers.parseUnits('920', 6));
  });

  it('REJECTS bursts of transactions beyond the hourly velocity limit', async function () {
    // maxTxPerHour = 3. Use tiny amounts so the daily cap doesn't interfere.
    await vault.connect(agent).execute(user.address, legit.address, ethers.parseUnits('1', 6), 't1', ethers.ZeroHash);
    await vault.connect(agent).execute(user.address, legit.address, ethers.parseUnits('1', 6), 't2', ethers.ZeroHash);
    await vault.connect(agent).execute(user.address, legit.address, ethers.parseUnits('1', 6), 't3', ethers.ZeroHash);

    await expect(
      vault.connect(agent).execute(user.address, legit.address, ethers.parseUnits('1', 6), 't4 too fast', ethers.ZeroHash)
    ).to.be.revertedWithCustomError(vault, 'ExceedsHourlyVelocity');
  });

  it('REJECTS any execute() call from an address that is not the agent key', async function () {
    // Even a perfectly policy-compliant request is refused if it doesn't come
    // from the registered agent key — an attacker without that key cannot
    // move funds no matter what they ask for.
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
});

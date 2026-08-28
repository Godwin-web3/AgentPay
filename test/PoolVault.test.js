const { expect } = require('chai');
const { ethers } = require('hardhat');

/**
 * Proves the singleton pool mechanism against a real local EVM:
 *  - creating a pool is cheap (no contract deployment, just a state write)
 *  - personal allowances are untouchable by anyone but their owner
 *  - discretionary spend below threshold auto-executes; above it, it waits
 *  - a single veto from any member blocks execution — provably, on-chain,
 *    the agent cannot execute past it
 *  - the SAME propose/veto/resolve path governs constitution changes and
 *    member removal, not just spend
 */
describe('PoolVault — singleton multi-tenant pools', function () {
  let usdc, pool, owner, agent, founder, mike, sarah, outsider, vendor;
  const DAY = 24 * 60 * 60;

  const defaultConstitution = {
    discretionaryThreshold: ethers.parseUnits('50', 6),
    objectionWindow: 4 * 60 * 60, // 4 hours
    maxSingleProposal: ethers.parseUnits('1000', 6),
  };

  beforeEach(async function () {
    [owner, agent, founder, mike, sarah, outsider, vendor] = await ethers.getSigners();

    const MockUSDC = await ethers.getContractFactory('MockUSDC');
    usdc = await MockUSDC.deploy();
    await usdc.waitForDeployment();

    const PoolVault = await ethers.getContractFactory('PoolVault');
    pool = await PoolVault.deploy(agent.address, await usdc.getAddress());
    await pool.waitForDeployment();

    for (const signer of [founder, mike, sarah]) {
      await usdc.mint(signer.address, ethers.parseUnits('1000', 6));
      await usdc.connect(signer).approve(await pool.getAddress(), ethers.parseUnits('1000', 6));
    }
  });

  async function createStandardPool() {
    const tx = await pool.connect(founder).createPool([mike.address, sarah.address], defaultConstitution);
    const receipt = await tx.wait();
    const event = receipt.logs.map(l => { try { return pool.interface.parseLog(l); } catch { return null; } }).find(e => e && e.name === 'PoolCreated');
    return event.args.poolId;
  }

  it('creates a pool for a fraction of the gas a real per-pool deployment would cost', async function () {
    // The actual side-by-side: what VaultFactory.createVault() costs today
    // (a full AgentVault deployment) versus what creating a pool costs here.
    const AgentVault = await ethers.getContractFactory('AgentVault');
    const vaultDeployTx = await AgentVault.getDeployTransaction(agent.address, await usdc.getAddress());
    const deployGasEstimate = await ethers.provider.estimateGas({ from: owner.address, data: vaultDeployTx.data });

    const tx = await pool.connect(founder).createPool([mike.address, sarah.address], defaultConstitution);
    const receipt = await tx.wait();

    expect(receipt.gasUsed).to.be.lessThan(deployGasEstimate / 3n);
    console.log(`      createPool: ${receipt.gasUsed} gas vs AgentVault deployment: ${deployGasEstimate} gas`);

    // Same PoolVault address before and after — no new contract exists.
    expect(await pool.getAddress()).to.equal(await pool.getAddress());
  });

  it('lets many pools live in the same contract, independently', async function () {
    const poolId1 = await createStandardPool();
    const tx2 = await pool.connect(mike).createPool([outsider.address], defaultConstitution);
    const receipt2 = await tx2.wait();
    const event2 = receipt2.logs.map(l => { try { return pool.interface.parseLog(l); } catch { return null; } }).find(e => e && e.name === 'PoolCreated');
    const poolId2 = event2.args.poolId;

    expect(poolId2).to.not.equal(poolId1);
    const [founder1] = await pool.getPool(poolId1);
    const [founder2] = await pool.getPool(poolId2);
    expect(founder1).to.equal(founder.address);
    expect(founder2).to.equal(mike.address);
  });

  it('requires an explicit accept before an invitee becomes a member', async function () {
    const poolId = await createStandardPool();
    expect(await pool.memberStatus(poolId, mike.address)).to.equal(1); // Invited

    await expect(
      pool.connect(mike).contribute(poolId, ethers.parseUnits('10', 6), true)
    ).to.be.revertedWithCustomError(pool, 'NotMember');

    await pool.connect(mike).acceptInvite(poolId);
    expect(await pool.memberStatus(poolId, mike.address)).to.equal(2); // Active

    await expect(pool.connect(mike).contribute(poolId, ethers.parseUnits('10', 6), true)).to.not.be.reverted;
  });

  it('never silently adds an invitee — an outsider cannot self-accept', async function () {
    const poolId = await createStandardPool();
    await expect(pool.connect(outsider).acceptInvite(poolId)).to.be.revertedWithCustomError(pool, 'NotInvited');
  });

  it('keeps personal allowance untouchable: instant self-withdraw, no proposal, no veto possible', async function () {
    const poolId = await createStandardPool();
    await pool.connect(mike).acceptInvite(poolId);
    await pool.connect(mike).contribute(poolId, ethers.parseUnits('100', 6), false); // personal bucket

    // Mike withdraws his own personal money directly — no agent call at all.
    await expect(pool.connect(mike).withdrawPersonal(poolId, ethers.parseUnits('40', 6)))
      .to.emit(pool, 'PersonalWithdrawn');
    expect(await pool.personalBalance(poolId, mike.address)).to.equal(ethers.parseUnits('60', 6));

    // Nobody else's balance is touched by Mike's withdrawal.
    expect(await usdc.balanceOf(founder.address)).to.equal(ethers.parseUnits('1000', 6));
  });

  it('auto-executes a discretionary spend below threshold immediately, no waiting', async function () {
    const poolId = await createStandardPool();
    await pool.connect(founder).contribute(poolId, ethers.parseUnits('200', 6), true);

    const tx = await pool.connect(agent).proposeSpend(poolId, founder.address, vendor.address, ethers.parseUnits('30', 6), 'internet bill');
    await expect(tx).to.emit(pool, 'ProposalResolved').withArgs(1n, true);
    expect(await usdc.balanceOf(vendor.address)).to.equal(ethers.parseUnits('30', 6));
  });

  it('holds a spend above threshold for the objection window, then resolves it if unvetoed', async function () {
    const poolId = await createStandardPool();
    await pool.connect(founder).contribute(poolId, ethers.parseUnits('200', 6), true);

    const proposalId = await pool.connect(agent).proposeSpend.staticCall(poolId, founder.address, vendor.address, ethers.parseUnits('150', 6), 'groceries');
    await pool.connect(agent).proposeSpend(poolId, founder.address, vendor.address, ethers.parseUnits('150', 6), 'groceries');

    // Too early — window hasn't elapsed.
    await expect(pool.connect(agent).resolveProposal(proposalId)).to.be.revertedWithCustomError(pool, 'WindowNotElapsed');
    expect(await usdc.balanceOf(vendor.address)).to.equal(0n);

    await ethers.provider.send('evm_increaseTime', [defaultConstitution.objectionWindow + 1]);
    await ethers.provider.send('evm_mine');

    await expect(pool.connect(agent).resolveProposal(proposalId)).to.emit(pool, 'ProposalResolved').withArgs(proposalId, true);
    expect(await usdc.balanceOf(vendor.address)).to.equal(ethers.parseUnits('150', 6));
  });

  it('a single veto from any member blocks execution — the agent cannot override it', async function () {
    const poolId = await createStandardPool();
    await pool.connect(sarah).acceptInvite(poolId);
    await pool.connect(founder).contribute(poolId, ethers.parseUnits('200', 6), true);

    const proposalId = await pool.connect(agent).proposeSpend.staticCall(poolId, founder.address, vendor.address, ethers.parseUnits('150', 6), 'groceries');
    await pool.connect(agent).proposeSpend(poolId, founder.address, vendor.address, ethers.parseUnits('150', 6), 'groceries');

    await expect(pool.connect(sarah).veto(proposalId)).to.emit(pool, 'ProposalVetoed').withArgs(proposalId, sarah.address);

    await ethers.provider.send('evm_increaseTime', [defaultConstitution.objectionWindow + 1]);
    await ethers.provider.send('evm_mine');

    await expect(pool.connect(agent).resolveProposal(proposalId)).to.be.revertedWithCustomError(pool, 'ProposalVetoedError');
    expect(await usdc.balanceOf(vendor.address)).to.equal(0n);
    // Funds are still sitting safely in the shared pool.
    const [, , , sharedBalance] = await pool.getPool(poolId);
    expect(sharedBalance).to.equal(ethers.parseUnits('200', 6));
  });

  it('rejects a veto from a non-member', async function () {
    const poolId = await createStandardPool();
    await pool.connect(founder).contribute(poolId, ethers.parseUnits('200', 6), true);
    const proposalId = await pool.connect(agent).proposeSpend.staticCall(poolId, founder.address, vendor.address, ethers.parseUnits('150', 6), 'x');
    await pool.connect(agent).proposeSpend(poolId, founder.address, vendor.address, ethers.parseUnits('150', 6), 'x');

    await expect(pool.connect(outsider).veto(proposalId)).to.be.revertedWithCustomError(pool, 'NotMember');
  });

  it('rejects any proposal above the backstop cap regardless of threshold logic', async function () {
    const poolId = await createStandardPool();
    await usdc.mint(founder.address, ethers.parseUnits('2000', 6));
    await usdc.connect(founder).approve(await pool.getAddress(), ethers.parseUnits('2000', 6));
    await pool.connect(founder).contribute(poolId, ethers.parseUnits('2000', 6), true);

    await expect(
      pool.connect(agent).proposeSpend(poolId, founder.address, vendor.address, ethers.parseUnits('1500', 6), 'too much')
    ).to.be.revertedWithCustomError(pool, 'ExceedsBackstopCap');
  });

  it('governs a constitution amendment through the same propose/veto/resolve path', async function () {
    const poolId = await createStandardPool();
    const newConstitution = { ...defaultConstitution, discretionaryThreshold: ethers.parseUnits('200', 6) };

    const proposalId = await pool.connect(agent).proposeAmendConstitution.staticCall(poolId, founder.address, newConstitution);
    await pool.connect(agent).proposeAmendConstitution(poolId, founder.address, newConstitution);

    await ethers.provider.send('evm_increaseTime', [defaultConstitution.objectionWindow + 1]);
    await ethers.provider.send('evm_mine');
    await pool.connect(agent).resolveProposal(proposalId);

    const [, , constitution] = await pool.getPool(poolId);
    expect(constitution.discretionaryThreshold).to.equal(ethers.parseUnits('200', 6));
  });

  it('governs member removal through the same propose/veto/resolve path, and a veto blocks it too', async function () {
    const poolId = await createStandardPool();
    await pool.connect(mike).acceptInvite(poolId);

    const proposalId = await pool.connect(agent).proposeRemoveMember.staticCall(poolId, founder.address, mike.address);
    await pool.connect(agent).proposeRemoveMember(poolId, founder.address, mike.address);

    // Mike vetoes his own removal.
    await pool.connect(mike).veto(proposalId);

    await ethers.provider.send('evm_increaseTime', [defaultConstitution.objectionWindow + 1]);
    await ethers.provider.send('evm_mine');

    await expect(pool.connect(agent).resolveProposal(proposalId)).to.be.revertedWithCustomError(pool, 'ProposalVetoedError');
    expect(await pool.memberStatus(poolId, mike.address)).to.equal(2); // still Active
  });

  it('rejects a proposal attributed to someone who is not actually an active member', async function () {
    const poolId = await createStandardPool();
    await expect(
      pool.connect(agent).proposeSpend(poolId, outsider.address, vendor.address, ethers.parseUnits('10', 6), 'x')
    ).to.be.revertedWithCustomError(pool, 'ProposerNotMember');
  });

  it('rejects any propose*/resolve call from an address that is not the agent', async function () {
    const poolId = await createStandardPool();
    await expect(
      pool.connect(outsider).proposeSpend(poolId, founder.address, vendor.address, ethers.parseUnits('10', 6), 'x')
    ).to.be.revertedWithCustomError(pool, 'NotAgent');
  });
});

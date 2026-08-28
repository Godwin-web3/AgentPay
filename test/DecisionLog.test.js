const { expect } = require('chai');
const { ethers } = require('hardhat');

describe('DecisionLog — decision provenance', function () {
  let log, owner, agent, newAgent, outsider;
  const requestId = ethers.id('job-1-payment');
  const decisionRecord = JSON.stringify({ goal: 'pay vendor', plan: ['pay'], action: { to: '0xabc', amount: 5 } });
  const decisionHash = ethers.keccak256(ethers.toUtf8Bytes(decisionRecord));

  beforeEach(async function () {
    [owner, agent, newAgent, outsider] = await ethers.getSigners();
    const DecisionLog = await ethers.getContractFactory('DecisionLog');
    log = await DecisionLog.deploy(agent.address);
    await log.waitForDeployment();
  });

  it('lets the agent commit a decision before execution and exposes it for verification', async function () {
    await expect(log.connect(agent).commit(requestId, decisionHash, 'pay 5 USDC to vendor'))
      .to.emit(log, 'DecisionCommitted');

    const stored = await log.getDecision(requestId);
    expect(stored.decisionHash).to.equal(decisionHash);
    expect(stored.committedBlock).to.be.gt(0);

    expect(await log.verify(requestId, decisionHash)).to.equal(true);
    // A tampered/rewritten record produces a different hash and fails verification.
    const tamperedHash = ethers.keccak256(ethers.toUtf8Bytes(decisionRecord + 'x'));
    expect(await log.verify(requestId, tamperedHash)).to.equal(false);
  });

  it('rejects commits from anyone but the registered agent', async function () {
    await expect(
      log.connect(outsider).commit(requestId, decisionHash, 'forged')
    ).to.be.revertedWithCustomError(log, 'NotAgent');
  });

  it('rejects a duplicate commit for the same requestId (no rewriting history)', async function () {
    await log.connect(agent).commit(requestId, decisionHash, 'first');
    await expect(
      log.connect(agent).commit(requestId, decisionHash, 'second')
    ).to.be.revertedWithCustomError(log, 'AlreadyCommitted');
  });

  it('finalizes an outcome exactly once, only after a commit exists', async function () {
    const outcomeHash = ethers.keccak256(ethers.toUtf8Bytes('tx-success'));

    await expect(
      log.connect(agent).finalize(requestId, outcomeHash)
    ).to.be.revertedWithCustomError(log, 'NotCommitted');

    await log.connect(agent).commit(requestId, decisionHash, 'pay 5 USDC to vendor');
    await expect(log.connect(agent).finalize(requestId, outcomeHash)).to.emit(log, 'DecisionFinalized');

    const stored = await log.getDecision(requestId);
    expect(stored.finalized).to.equal(true);
    expect(stored.outcomeHash).to.equal(outcomeHash);

    await expect(
      log.connect(agent).finalize(requestId, outcomeHash)
    ).to.be.revertedWithCustomError(log, 'AlreadyFinalized');
  });

  it('rotates the agent key in two steps, old key loses commit rights immediately after acceptance', async function () {
    await log.connect(owner).proposeAgent(newAgent.address);
    await expect(log.connect(outsider).acceptAgent()).to.be.revertedWithCustomError(log, 'NotPendingAgent');

    await expect(log.connect(newAgent).acceptAgent()).to.emit(log, 'AgentUpdated');

    await expect(
      log.connect(agent).commit(requestId, decisionHash, 'old agent trying to commit')
    ).to.be.revertedWithCustomError(log, 'NotAgent');

    await expect(log.connect(newAgent).commit(requestId, decisionHash, 'new agent commits')).to.emit(log, 'DecisionCommitted');
  });
});

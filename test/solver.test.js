const { expect } = require('chai');
const { validatePlan, runStep, advancePlan } = require('../src/solver');

/**
 * These tests exercise src/solver.js's state machine directly with mocked
 * dependencies — no Groq, no Firestore, no chain. They prove the plan
 * executor's actual control flow (ordering, blocking, decision-commit
 * ordering, failure handling) rather than trusting an LLM to produce it
 * correctly at demo time.
 */
describe('solver — validatePlan', function () {
  it('rejects a plan with no steps', function () {
    expect(() => validatePlan({ steps: [] })).to.throw(/non-empty/);
  });

  it('rejects an invented primitive', function () {
    expect(() => validatePlan({ steps: [{ type: 'swap', to: '0x1' }] })).to.throw(/unsupported type/);
  });

  it('rejects a pay step missing an amount', function () {
    expect(() => validatePlan({ steps: [{ type: 'pay', to: '0xabc' }] })).to.throw(/positive "amount"/);
  });

  it('accepts a well-formed multi-step plan', function () {
    const plan = {
      steps: [
        { type: 'check_balance', minBalance: 500 },
        { type: 'wait_for_condition', condition: { type: 'price', coin: 'bitcoin', operator: '>', threshold: 100000 } },
        { type: 'pay', to: '0xabc0000000000000000000000000000000000a', amount: 10, reason: 'vendor' },
      ],
    };
    expect(() => validatePlan(plan)).to.not.throw();
  });
});

function makeDeps(overrides = {}) {
  const calls = [];
  return {
    calls,
    getVaultBalance: async () => 1000,
    evaluateTrigger: async () => ({ met: true, proof: 'mock' }),
    pay: async (to, amount, reason, userAddress) => {
      calls.push({ fn: 'pay', to, amount, reason, userAddress });
      return { success: true, txHash: '0xdeadbeef' };
    },
    hireAgent: async (description, budget, userAddress) => {
      calls.push({ fn: 'hireAgent', description, budget, userAddress });
      return { success: true, jobId: '42' };
    },
    commitDecision: async (requestId, record, summary) => {
      calls.push({ fn: 'commitDecision', requestId, record, summary });
    },
    finalizeDecision: async (requestId, outcomeRecord) => {
      calls.push({ fn: 'finalizeDecision', requestId, outcomeRecord });
    },
    makeRequestId: (planId, stepIndex) => `${planId}-${stepIndex}`,
    now: () => 'T',
    ...overrides,
  };
}

describe('solver — runStep', function () {
  it('check_balance blocks when balance is insufficient', async function () {
    const deps = makeDeps({ getVaultBalance: async () => 10 });
    const outcome = await runStep({ type: 'check_balance', minBalance: 500 }, {}, deps);
    expect(outcome.waiting).to.equal(true);
  });

  it('wait_for_condition blocks when the trigger is not met', async function () {
    const deps = makeDeps({ evaluateTrigger: async () => ({ met: false }) });
    const outcome = await runStep({ type: 'wait_for_condition', condition: { type: 'price' } }, {}, deps);
    expect(outcome.waiting).to.equal(true);
  });

  it('pay commits a decision BEFORE paying and finalizes AFTER', async function () {
    const deps = makeDeps();
    await runStep(
      { type: 'pay', to: '0xabc', amount: 5, reason: 'r' },
      { planId: 'p1', stepIndex: 0, goal: 'g', userAddress: '0xuser' },
      deps
    );
    const order = deps.calls.map((c) => c.fn);
    expect(order).to.deep.equal(['commitDecision', 'pay', 'finalizeDecision']);
  });

  it('pay step throws (and still finalizes) when the underlying payment fails', async function () {
    const deps = makeDeps({ pay: async () => ({ success: false, reason: 'ExceedsDailyCap' }) });
    let threw = false;
    try {
      await runStep({ type: 'pay', to: '0xabc', amount: 5 }, { planId: 'p1', stepIndex: 0, goal: 'g', userAddress: '0xuser' }, deps);
    } catch (e) {
      threw = true;
      expect(e.message).to.match(/ExceedsDailyCap/);
    }
    expect(threw).to.equal(true);
    expect(deps.calls.some((c) => c.fn === 'finalizeDecision')).to.equal(true);
  });
});

describe('solver — advancePlan', function () {
  it('runs a fully-ready plan straight through to completion', async function () {
    const deps = makeDeps();
    const planDoc = {
      id: 'plan1',
      goal: 'pay vendor twice',
      userAddress: '0xuser',
      cursor: 0,
      status: 'active',
      log: [],
      steps: [
        { type: 'pay', to: '0xabc', amount: 5, reason: 'r1' },
        { type: 'pay', to: '0xabc', amount: 5, reason: 'r2' },
      ],
    };
    const result = await advancePlan(planDoc, deps);
    expect(result.status).to.equal('completed');
    expect(result.cursor).to.equal(2);
    expect(deps.calls.filter((c) => c.fn === 'pay')).to.have.length(2);
  });

  it('stops and stays active at the first blocking step, without executing later steps', async function () {
    const deps = makeDeps({ getVaultBalance: async () => 10 });
    const planDoc = {
      id: 'plan2',
      goal: 'wait then pay',
      userAddress: '0xuser',
      cursor: 0,
      status: 'active',
      log: [],
      steps: [
        { type: 'check_balance', minBalance: 500 },
        { type: 'pay', to: '0xabc', amount: 5 },
      ],
    };
    const result = await advancePlan(planDoc, deps);
    expect(result.status).to.equal('active');
    expect(result.cursor).to.equal(0);
    expect(deps.calls.filter((c) => c.fn === 'pay')).to.have.length(0);
  });

  it('resumes from a blocked step once conditions change, without re-running earlier completed steps', async function () {
    const deps = makeDeps();
    let planDoc = {
      id: 'plan3',
      goal: 'pay then wait then pay',
      userAddress: '0xuser',
      cursor: 0,
      status: 'active',
      log: [],
      steps: [
        { type: 'pay', to: '0xabc', amount: 1, reason: 'first' },
        { type: 'wait_for_condition', condition: { type: 'price' } },
        { type: 'pay', to: '0xabc', amount: 2, reason: 'second' },
      ],
    };

    // First tick: step 0 pays, step 1 blocks (condition not yet met).
    deps.evaluateTrigger = async () => ({ met: false });
    planDoc = await advancePlan(planDoc, deps);
    expect(planDoc.status).to.equal('active');
    expect(planDoc.cursor).to.equal(1);
    expect(deps.calls.filter((c) => c.fn === 'pay')).to.have.length(1);

    // Second tick: condition now met, should NOT re-pay step 0, should run step 2.
    deps.evaluateTrigger = async () => ({ met: true });
    planDoc = await advancePlan(planDoc, deps);
    expect(planDoc.status).to.equal('completed');
    expect(deps.calls.filter((c) => c.fn === 'pay')).to.have.length(2);
    expect(deps.calls.filter((c) => c.fn === 'pay')[1].amount).to.equal(2);
  });

  it('marks the plan failed and stops advancing once a step throws', async function () {
    const deps = makeDeps();
    deps.pay = async (to, amount, reason, userAddress) => {
      deps.calls.push({ fn: 'pay', to, amount, reason, userAddress });
      return { success: false, reason: 'NotWhitelisted' };
    };
    const planDoc = {
      id: 'plan4',
      goal: 'pay to attacker somehow',
      userAddress: '0xuser',
      cursor: 0,
      status: 'active',
      log: [],
      steps: [
        { type: 'pay', to: '0xattacker', amount: 5 },
        { type: 'pay', to: '0xabc', amount: 5 },
      ],
    };
    const result = await advancePlan(planDoc, deps);
    expect(result.status).to.equal('failed');
    expect(result.cursor).to.equal(0);
    expect(deps.calls.filter((c) => c.fn === 'pay')).to.have.length(1);
    expect(result.error).to.match(/NotWhitelisted/);
  });
});

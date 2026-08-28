/**
 * src/solver.js — Intent solver core.
 *
 * Turns a user's stated GOAL ("keep the vendor paid as long as the job's
 * done and my balance stays above $500") into a plan graph built only from a
 * fixed set of primitives, then advances that plan one step at a time.
 *
 * Split into two halves on purpose:
 *   - planFromGoal(): the only part that talks to the LLM. Its output is
 *     always run through validatePlan() before anything trusts it.
 *   - advancePlan()/runStep(): pure, dependency-injected state machine with
 *     no direct Groq/Firestore/ethers imports, so it can be unit tested
 *     (see test/solver.test.js) without any live credentials. src/intentEngine.js
 *     wires it to the real chain/LLM/store implementations.
 */

const PRIMITIVES = ['check_balance', 'wait_for_condition', 'pay', 'hire_agent'];

function validatePlan(plan) {
  if (!plan || !Array.isArray(plan.steps) || plan.steps.length === 0) {
    throw new Error('Plan must have a non-empty "steps" array');
  }
  if (plan.steps.length > 20) {
    throw new Error('Plan has too many steps (max 20) — ask for a narrower goal');
  }
  plan.steps.forEach((step, i) => {
    if (!step || !PRIMITIVES.includes(step.type)) {
      throw new Error(`Step ${i} has unsupported type "${step && step.type}". Allowed: ${PRIMITIVES.join(', ')}`);
    }
    if (step.type === 'pay') {
      if (typeof step.to !== 'string' || !step.to.startsWith('0x')) throw new Error(`Step ${i} (pay) needs a valid "to" address`);
      if (!(Number(step.amount) > 0)) throw new Error(`Step ${i} (pay) needs a positive "amount"`);
    }
    if (step.type === 'hire_agent') {
      if (!step.description) throw new Error(`Step ${i} (hire_agent) needs a "description"`);
      if (!(Number(step.budget) > 0)) throw new Error(`Step ${i} (hire_agent) needs a positive "budget"`);
    }
    if (step.type === 'wait_for_condition') {
      if (!step.condition || !step.condition.type) throw new Error(`Step ${i} (wait_for_condition) needs a "condition" with a "type"`);
    }
    if (step.type === 'check_balance') {
      if (!(Number(step.minBalance) >= 0)) throw new Error(`Step ${i} (check_balance) needs a non-negative "minBalance"`);
    }
  });
  return plan;
}

let _groqClient = null;
function getGroq() {
  if (_groqClient) return _groqClient;
  const Groq = require('groq-sdk');
  _groqClient = new Groq({ apiKey: process.env.GROQ_API_KEY });
  return _groqClient;
}

const SOLVER_SYSTEM_PROMPT = `You are AgentPay's intent solver. The user states a GOAL, not a single command.
Decompose it into a plan graph: an ordered list of steps built ONLY from these primitives —

- {"type":"check_balance","minBalance":N} — block until the vault balance is >= N USDC.
- {"type":"wait_for_condition","condition":{"type":"price","coin":"bitcoin|ethereum","operator":">|<|>=|<=|==","threshold":N}} — block on a Pyth-backed price condition.
- {"type":"wait_for_condition","condition":{"type":"github","repo":"owner/name","number":N,"condition":"merged"}} — block until a PR is merged.
- {"type":"wait_for_condition","condition":{"type":"weather","city":"...","threshold":N}} — block until precipitation exceeds threshold mm.
- {"type":"pay","to":"0x...","amount":N,"reason":"..."} — pay N USDC through the user's policy-enforced vault. This is hard-capped on-chain no matter what you plan.
- {"type":"hire_agent","description":"...","budget":N} — post an escrowed job for another autonomous agent to complete for N USDC.

Rules:
- Steps run strictly in order; a wait/check step blocks every later step until satisfied.
- Never invent a primitive or field outside this list.
- Keep plans short (usually 1-4 steps) and concrete — resolve vague goals into specific addresses/amounts only if the user gave them; otherwise ask via a "chat" style step is NOT supported, so if the goal is unresolvable with the primitives above, respond with {"steps":[],"unresolvable":true,"message":"..."}.
- Respond with ONLY valid JSON: {"goal":"<restated goal>","steps":[...]}`;

async function planFromGoal(goal, walletAddress, usdcBalance) {
  const groq = getGroq();
  const completion = await groq.chat.completions.create({
    messages: [
      { role: 'system', content: SOLVER_SYSTEM_PROMPT },
      { role: 'user', content: `Wallet ${walletAddress}. Current vault balance: ${usdcBalance} USDC. Goal: ${goal}` }
    ],
    model: process.env.GROQ_MODEL || 'llama-3.3-70b-versatile',
    temperature: 0.1,
    max_tokens: 800,
  });

  let raw = completion.choices[0].message.content.replace(/```json|```/g, '').trim();
  let plan;
  try {
    plan = JSON.parse(raw);
  } catch (e) {
    throw new Error('Solver returned non-JSON plan: ' + raw.slice(0, 200));
  }
  if (plan.unresolvable) {
    const err = new Error(plan.message || 'Goal cannot be expressed with current primitives');
    err.unresolvable = true;
    throw err;
  }
  return validatePlan(plan);
}

/**
 * Execute one step. `deps` must provide:
 *   pay(to, amount, reason, userAddress) -> {success, txHash, reason}
 *   hireAgent(description, budget, userAddress) -> {success, jobId, reason}
 *   evaluateTrigger(condition) -> {met, proof}
 *   getVaultBalance(userAddress) -> number
 *   commitDecision(requestId, record, summary) -> void (may be a no-op)
 *   finalizeDecision(requestId, outcomeRecord) -> void (may be a no-op)
 *   makeRequestId(planId, stepIndex) -> string/bytes32
 */
async function runStep(step, ctx, deps) {
  switch (step.type) {
    case 'check_balance': {
      const balance = await deps.getVaultBalance(ctx.userAddress);
      return balance >= step.minBalance
        ? { done: true, result: { balance } }
        : { done: false, waiting: true, reason: `balance ${balance} < required ${step.minBalance}` };
    }
    case 'wait_for_condition': {
      const outcome = await deps.evaluateTrigger(step.condition);
      return outcome.met
        ? { done: true, result: outcome }
        : { done: false, waiting: true, reason: outcome.error || 'condition not met' };
    }
    case 'pay': {
      const requestId = deps.makeRequestId(ctx.planId, ctx.stepIndex);
      const record = { goal: ctx.goal, planId: ctx.planId, stepIndex: ctx.stepIndex, step };
      await deps.commitDecision(requestId, record, `pay ${step.amount} USDC to ${step.to}`);
      const result = await deps.pay(step.to, step.amount, step.reason || ctx.goal, ctx.userAddress);
      await deps.finalizeDecision(requestId, { success: result.success, txHash: result.txHash, reason: result.reason });
      if (!result.success) throw new Error('pay step failed: ' + result.reason);
      return { done: true, result };
    }
    case 'hire_agent': {
      const requestId = deps.makeRequestId(ctx.planId, ctx.stepIndex);
      const record = { goal: ctx.goal, planId: ctx.planId, stepIndex: ctx.stepIndex, step };
      await deps.commitDecision(requestId, record, `hire agent: ${step.description}`);
      const result = await deps.hireAgent(step.description, step.budget, ctx.userAddress, step.providerAddress);
      await deps.finalizeDecision(requestId, { success: result.success, jobId: result.jobId, reason: result.reason });
      if (!result.success) throw new Error('hire_agent step failed: ' + result.reason);
      return { done: true, result };
    }
    default:
      throw new Error('Unknown step type: ' + step.type);
  }
}

/**
 * Advance a persisted plan document as far as it will currently go.
 * planDoc: { id, goal, userAddress, steps, cursor, status, log }
 * Returns a new planDoc (caller is responsible for persisting it).
 */
async function advancePlan(planDoc, deps) {
  if (planDoc.status !== 'active') return planDoc;

  let cursor = planDoc.cursor || 0;
  const log = (planDoc.log || []).slice();
  const now = deps.now ? deps.now() : new Date().toISOString();

  while (cursor < planDoc.steps.length) {
    const step = planDoc.steps[cursor];
    const ctx = { planId: planDoc.id, stepIndex: cursor, goal: planDoc.goal, userAddress: planDoc.userAddress };
    try {
      const outcome = await runStep(step, ctx, deps);
      if (outcome.waiting) {
        log.push({ step: cursor, at: now, status: 'waiting', reason: outcome.reason });
        return { ...planDoc, cursor, log, status: 'active' };
      }
      log.push({ step: cursor, at: now, status: 'done', outcome });
      cursor += 1;
    } catch (err) {
      log.push({ step: cursor, at: now, status: 'failed', error: err.message });
      return { ...planDoc, cursor, log, status: 'failed', error: err.message };
    }
  }

  return { ...planDoc, cursor, log, status: 'completed' };
}

module.exports = { PRIMITIVES, validatePlan, planFromGoal, runStep, advancePlan };

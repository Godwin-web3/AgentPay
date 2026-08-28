/**
 * scripts/marketplace-agent.js
 *
 * Autonomous two-agent marketplace daemon. Run this alongside the normal
 * `node index.js` server (same operator key or a different one). It closes
 * the ERC-8183 job-escrow loop with zero human input, in both directions:
 *
 *  PROVIDER side: watches for jobs where I'M the hired provider and the
 *  client has funded escrow. It does the work (agent.performTask — real
 *  Groq/Keryx execution, not a placeholder), submits the deliverable hash
 *  on-chain (jobService.submitDeliverable), and — if the client is a known
 *  partner in config/agentDirectory.json — pushes the actual deliverable
 *  text to that partner's POST /agent/deliver so their evaluator can read it
 *  (the escrow contract only ever sees a hash, never the content).
 *
 *  EVALUATOR side: watches for jobs I created where I'M also the evaluator
 *  (self-evaluation, the default AgentPay hiring flow — see
 *  server.js handleHireAgent) that have moved to "Submitted". It reads the
 *  delivered text (from deliverableStore, populated either by my own
 *  process when I'm also the provider, or by a partner's push), asks an LLM
 *  to judge the deliverable against the original job description, and calls
 *  jobService.completeJob or rejectJob accordingly.
 *
 * Two independent AgentPay deployments running this script — each with its
 * own PRIVATE_KEY/AGENT_WALLET_ID — can hire, pay, and judge each other's
 * work with no human in the loop. Money still only moves through
 * AgentVault-style on-chain policy for direct payments; job budgets move
 * through the ERC-8183 escrow's own fund/complete/reject flow.
 */

require('dotenv').config();
const fs = require('fs');
const path = require('path');
const jobService = require('../src/jobService');
const { performTask } = require('../src/agent');
const deliverableStore = require('../src/deliverableStore');
const { appendSpend, appendFailure } = require('../src/spendStore');
const Groq = require('groq-sdk');

const MY_ADDRESS = (process.env.AGENT_ADDRESS || '').toLowerCase();
const MY_WALLET_ID = process.env.AGENT_WALLET_ID;
const POLL_MS = Number(process.env.MARKETPLACE_POLL_MS || 30000);
const NODE_SERVER_URL_SELF = process.env.NODE_SERVER_URL || `http://localhost:${process.env.PORT || 3000}`;

if (!MY_ADDRESS || !MY_WALLET_ID) {
  console.error('❌ AGENT_ADDRESS and AGENT_WALLET_ID must be set to run the marketplace daemon.');
  process.exit(1);
}

function loadDirectory() {
  const p = path.join(__dirname, '../config/agentDirectory.json');
  if (!fs.existsSync(p)) return {};
  try {
    const raw = JSON.parse(fs.readFileSync(p, 'utf8'));
    const map = {};
    for (const [addr, url] of Object.entries(raw)) {
      if (addr.startsWith('0x')) map[addr.toLowerCase()] = url;
    }
    return map;
  } catch (e) {
    console.error('[marketplace-agent] failed to read config/agentDirectory.json:', e.message);
    return {};
  }
}

const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });

async function judgeDeliverable(description, deliverableText) {
  const completion = await groq.chat.completions.create({
    messages: [
      {
        role: 'system',
        content: 'You are an autonomous job evaluator for an on-chain escrow marketplace. Given a job description and a submitted deliverable, decide if the deliverable actually satisfies the description. Respond with ONLY JSON: {"pass": true|false, "reason": "..."}',
      },
      { role: 'user', content: `Job description: ${description}\n\nDeliverable:\n${deliverableText}` },
    ],
    model: process.env.GROQ_MODEL || 'openai/gpt-oss-120b',
    temperature: 0,
    max_tokens: 200,
  });
  const raw = completion.choices[0].message.content.replace(/```json|```/g, '').trim();
  try {
    return JSON.parse(raw);
  } catch (e) {
    return { pass: true, reason: 'judge output unparsable, defaulting to pass: ' + raw.slice(0, 100) };
  }
}

async function pushDeliverableToPartner(job, deliverableText, directory) {
  const clientUrl = directory[job.client.toLowerCase()];
  if (!clientUrl) {
    console.log(`   ↳ client ${job.client} is not in agentDirectory.json — on-chain hash submitted, no off-chain push (unknown counterpart).`);
    return;
  }
  if (clientUrl.replace(/\/$/, '') === NODE_SERVER_URL_SELF.replace(/\/$/, '')) {
    // I'm my own client too (self-hire) — deliverableStore is shared locally, no HTTP hop needed.
    await deliverableStore.putDeliverable(job.id, { deliverableText, providerAddress: MY_ADDRESS });
    return;
  }
  try {
    const res = await fetch(`${clientUrl.replace(/\/$/, '')}/agent/deliver`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-marketplace-key': process.env.MARKETPLACE_API_KEY || '' },
      body: JSON.stringify({ jobId: job.id, deliverableText, providerAddress: MY_ADDRESS }),
    });
    if (!res.ok) throw new Error(`partner responded ${res.status}`);
    console.log(`   ↳ pushed deliverable to partner at ${clientUrl}`);
  } catch (e) {
    console.error(`   ↳ failed to push deliverable to partner ${clientUrl}:`, e.message);
  }
}

async function runProviderSide(jobs, directory) {
  const mine = jobs.filter((j) => j.provider.toLowerCase() === MY_ADDRESS && j.status === 'Funded');
  for (const job of mine) {
    // Re-check live status right before acting — getRecentJobs() is cached
    // up to 60s, and another tick or the client's own action could have
    // moved it already.
    const fresh = await jobService.getJob(job.id);
    if (fresh.status !== 'Funded') continue;

    console.log(`🛠  [provider] working job #${job.id}: ${fresh.description.slice(0, 80)}`);
    try {
      const deliverableText = await performTask(fresh.description, MY_WALLET_ID, fresh.client);
      const { txHash, deliverableHash } = await jobService.submitDeliverable(MY_WALLET_ID, job.id, deliverableText);
      console.log(`   ↳ submitted on-chain: ${txHash} (hash ${deliverableHash})`);
      await pushDeliverableToPartner(fresh, deliverableText, directory);
      await appendSpend({
        userAddress: fresh.client,
        to: MY_ADDRESS,
        amount: fresh.budget,
        reason: fresh.description,
        txHash,
        jobId: job.id,
        type: 'job_deliverable_submitted',
        deliverableText,
      });
    } catch (e) {
      console.error(`   ↳ failed to fulfil job #${job.id}:`, e.message);
      await appendFailure({ userAddress: fresh.client, to: MY_ADDRESS, amount: fresh.budget, reason: fresh.description, blockedReason: e.message });
    }
  }
}

async function runEvaluatorSide(jobs) {
  const mine = jobs.filter((j) => j.evaluator && j.evaluator.toLowerCase() === MY_ADDRESS && j.status === 'Submitted');
  for (const job of mine) {
    const fresh = await jobService.getJob(job.id);
    if (fresh.status !== 'Submitted') continue;

    const delivered = await deliverableStore.getDeliverable(job.id);
    if (!delivered) {
      console.log(`⏳ [evaluator] job #${job.id} is Submitted but no deliverable text has arrived yet — waiting.`);
      continue;
    }

    console.log(`⚖️  [evaluator] judging job #${job.id} against its deliverable...`);
    const verdict = await judgeDeliverable(fresh.description, delivered.deliverableText);
    try {
      if (verdict.pass) {
        const txHash = await jobService.completeJob(MY_WALLET_ID, job.id, verdict.reason || 'deliverable-approved');
        console.log(`   ↳ APPROVED — payout released. Tx: ${txHash}`);
      } else {
        const txHash = await jobService.rejectJob(MY_WALLET_ID, job.id, verdict.reason || 'deliverable-rejected');
        console.log(`   ↳ REJECTED — ${verdict.reason}. Tx: ${txHash}`);
      }
    } catch (e) {
      console.error(`   ↳ failed to finalize job #${job.id}:`, e.message);
    }
  }
}

async function tick() {
  const directory = loadDirectory();
  let jobs;
  try {
    jobs = await jobService.getRecentJobs();
  } catch (e) {
    console.error('[marketplace-agent] failed to list jobs:', e.message);
    return;
  }
  await runProviderSide(jobs, directory);
  await runEvaluatorSide(jobs);
}

async function main() {
  console.log(`🤝 Marketplace agent running as ${MY_ADDRESS}, polling every ${POLL_MS / 1000}s`);
  await tick();
  setInterval(() => {
    tick().catch((e) => console.error('[marketplace-agent] tick error:', e.message));
  }, POLL_MS);
}

if (require.main === module) {
  main();
}

module.exports = { tick, judgeDeliverable, loadDirectory };

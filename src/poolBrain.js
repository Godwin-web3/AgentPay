// src/poolBrain.js — natural-language front door for pools, mirroring
// src/brain.js's shape. Two entry points:
//   parsePoolCreation(description) — turns a sentence into a draft pool
//     (name, invites, constitution) for the user to confirm before anything
//     touches the chain.
//   parsePoolMessage(message, poolContext) — turns a message sent inside an
//     existing pool's group chat into one of a fixed set of actions
//     (contribute, propose_spend, propose_amend, propose_remove, chat).
// Both only ever produce a PROPOSED action — src/server.js still runs every
// resulting propose_spend/propose_amend/propose_remove through
// PoolVault.sol's on-chain policy exactly as before. Objecting to a
// proposal is never inferred from free text here — that stays an explicit
// button in the UI, on purpose (see frontend/src/views/Pools.tsx).

require('dotenv').config();
const Groq = require('groq-sdk');

const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });

function stripFences(raw) {
  return raw.replace(/```json|```/g, '').trim();
}

const CREATION_PROMPT = `You turn one sentence describing a shared-money pool into a structured draft.
Respond with ONLY JSON: {"name":"...","invites":["@tag or 0x...", ...],"discretionaryThreshold":N,"objectionWindowHours":N,"maxSingleProposal":N,"message":"one sentence summarizing the draft back to the user"}
Rules:
- "invites" are whatever @tags or addresses are mentioned; empty array if none.
- If the user gives a discretionary cap, hourly window, or backstop cap explicitly, use it. Otherwise use sane defaults for a small trusted group: discretionaryThreshold 50, objectionWindowHours 4, maxSingleProposal 1000.
- "name" should be short and drawn from the description; if none is given, invent a plain one from context (e.g. "Shared Pool").
- Never invent people who weren't mentioned.`;

async function parsePoolCreation(description) {
  const completion = await groq.chat.completions.create({
    messages: [
      { role: 'system', content: CREATION_PROMPT },
      { role: 'user', content: description },
    ],
    model: process.env.GROQ_MODEL || 'openai/gpt-oss-120b',
    temperature: 0.1,
    max_tokens: 400,
  });
  const parsed = JSON.parse(stripFences(completion.choices[0].message.content));
  return {
    name: String(parsed.name || 'Shared Pool').slice(0, 60),
    invites: Array.isArray(parsed.invites) ? parsed.invites.filter(Boolean) : [],
    constitution: {
      discretionaryThreshold: Number(parsed.discretionaryThreshold) || 50,
      objectionWindowHours: Number(parsed.objectionWindowHours) || 4,
      maxSingleProposal: Number(parsed.maxSingleProposal) || 1000,
    },
    message: parsed.message || `Draft pool "${parsed.name || 'Shared Pool'}" ready — review and create.`,
  };
}

const POOL_CHAT_PROMPT = (ctx) => `You are the assistant inside a shared-money pool's group chat. Everyone in the pool sees this thread.
Pool: "${ctx.name}". Members: ${ctx.memberList.join(', ')}. Shared balance: ${ctx.sharedBalance} USDC.
Constitution: spends under ${ctx.constitution.discretionaryThreshold} USDC execute immediately; spends up to the ${ctx.constitution.maxSingleProposal} USDC backstop cap wait ${(ctx.constitution.objectionWindow / 3600).toFixed(1)}h for objections; above the backstop cap is never allowed.

Respond with ONLY JSON, one of:
{"action":"contribute","amount":N,"toShared":true|false,"message":"..."}
{"action":"propose_spend","to":"0x... or @tag","amount":N,"reason":"...","message":"..."}
{"action":"propose_amend","discretionaryThreshold":N,"objectionWindowHours":N,"maxSingleProposal":N,"message":"..."}
{"action":"propose_remove","targetMember":"0x... or @tag","message":"..."}
{"action":"chat","message":"..."}

Rules:
- Never invent an amount, address, or member that wasn't stated or already a pool member.
- If a request is ambiguous or missing a required field (e.g. no amount), use "chat" and ask for what's missing.
- Objecting to a pending proposal is NOT handled here — if someone says they object, tell them (via "chat") to use the Object button on that proposal.`;

async function parsePoolMessage(message, poolContext) {
  const completion = await groq.chat.completions.create({
    messages: [
      { role: 'system', content: POOL_CHAT_PROMPT(poolContext) },
      { role: 'user', content: message },
    ],
    model: process.env.GROQ_MODEL || 'openai/gpt-oss-120b',
    temperature: 0.1,
    max_tokens: 400,
  });
  try {
    return JSON.parse(stripFences(completion.choices[0].message.content));
  } catch (e) {
    return { action: 'chat', message: "I didn't quite catch that as an action — could you rephrase?" };
  }
}

module.exports = { parsePoolCreation, parsePoolMessage };

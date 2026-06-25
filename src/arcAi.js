/**
 * src/arcAi.js — Arc "verifiable AI inference" integration shim.
 *
 * Status — HONEST: AgentPay does NOT currently run decentralized AI inference.
 * All prior "agent logic validation through decentralized consensus" copy in
 * the README was aspirational; in practice every LLM call went through Groq
 * off-chain (see src/brain.js). The Arc platform-level verifier contract +
 * agent-id scheme referenced by scripts/verify-arc-ai.js and
 * scripts/test-arc-ai.js (platform 0x037Bb9C7…, agent 12847…) could not be
 * verified against docs.arc.network at audit time, so we refuse to silently
 * burn gas against unverified addresses.
 *
 * This stub makes the verifier scripts runnable (they no longer crash with
 * MODULE_NOT_FOUND) and returns a structured, honestly-labelled result instead
 * of pretending to perform on-chain consensus verification. Flip
 * `ARC_VERIFIABLE_AI=1` and supply `ARC_AI_PLATFORM`, `ARC_AI_AGENT_ID` once the
 * real Arc verifier endpoint is confirmed.
 */

const { ethers } = require('ethers');

const ENABLED = process.env.ARC_VERIFIABLE_AI === '1';

/**
 * inferOnChain(prompt, system, wallet)
 * Returns { mode, prompt, system, response, verifiable, note }.
 * When ENABLED this would call Arc's platform.createRequest + poll; until then
 * it is an explicit no-op that quarantines the unverifiable path.
 */
async function inferOnChain(prompt, system, wallet) {
  if (ENABLED) {
    const platform = process.env.ARC_AI_PLATFORM;
    const agentId = process.env.ARC_AI_AGENT_ID;
    if (!platform || !agentId) {
      throw new Error('ARC_VERIFIABLE_AI=1 requires ARC_AI_PLATFORM and ARC_AI_AGENT_ID');
    }
    // Place a real createRequest call here once the Arc platform ABI/spec is
    // confirmed from docs.arc.network. Left intentionally unimplemented.
    throw new Error('Verifiable AI path configured but not yet implemented against a verified Arc platform ABI.');
  }

  return {
    mode: 'off-chain (Groq) — verifiable Arc inference not enabled',
    prompt,
    system,
    response: null,
    verifiable: false,
    note: 'Set ARC_VERIFIABLE_AI=1 plus ARC_AI_PLATFORM / ARC_AI_AGENT_ID to enable on-chain verification once the Arc platform ABI is confirmed.'
  };
}

module.exports = { inferOnChain };
/**
 * USDC unit handling — single source of truth for decimals.
 *
 * Arc's native USDC (gateway/native gas, 0x3600…0000) and the ERC-20 USDC used
 * by AgentVault internal accounting are assumed to share `USDC_DECIMALS` below.
 * Previously the codebase mixed `ethers.parseEther` (1e18) and `* 1e6` (1e6),
 * which silently mis-accounted balances between deposit and execute. Everything
 * now funnels through these helpers.
 */
const { ethers } = require('ethers');

// All current callers (AgentVault deposit/withdraw, escrow policy/payment
// accounting, job escrow budgets) interact with USDC's ERC-20 interface,
// which uses 6 decimals on Arc — NOT the native 18-decimal gas token.
const USDC_DECIMALS = Number(process.env.USDC_DECIMALS) || 6;

function toUnits(humanAmount) {
  return ethers.parseUnits(String(humanAmount), USDC_DECIMALS);
}

function fromUnits(weiAmount) {
  return parseFloat(ethers.formatUnits(weiAmount, USDC_DECIMALS));
}

module.exports = { USDC_DECIMALS, toUnits, fromUnits };
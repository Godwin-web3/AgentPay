/**
 * USDC unit handling for vault accounting.
 *
 * AgentVault talks to the ERC-20 interface. On Arc that interface is 6 decimals
 * even though native gas USDC is 18 decimals. On Base Sepolia, USDC is also 6.
 * Native gas conversion does not belong here. Use chain.nativeCurrency.decimals
 * for eth_getBalance.
 */
const { ethers } = require('ethers');
const { getChain } = require('../config/chains');

const USDC_DECIMALS = Number(process.env.USDC_DECIMALS) || getChain().usdcDecimals || 6;

function toUnits(humanAmount) {
  return ethers.parseUnits(String(humanAmount), USDC_DECIMALS);
}

function fromUnits(weiAmount) {
  return parseFloat(ethers.formatUnits(weiAmount, USDC_DECIMALS));
}

module.exports = { USDC_DECIMALS, toUnits, fromUnits };

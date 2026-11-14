/**
 * Stable-token unit handling. Decimals come from the active chain record
 * (config/chains.js) unless USDC_DECIMALS is set.
 * Arc gas is 18 decimals. The vault's ERC-20 stable is 6 on every chain here.
 */
const { ethers } = require('ethers');

function currentDecimals() {
  if (process.env.USDC_DECIMALS) return Number(process.env.USDC_DECIMALS);
  return require('../config/network').usdcDecimals;
}

function toUnits(humanAmount, decimals = currentDecimals()) {
  return ethers.parseUnits(String(humanAmount), decimals);
}

function fromUnits(weiAmount, decimals = currentDecimals()) {
  return parseFloat(ethers.formatUnits(weiAmount, decimals));
}

module.exports = { toUnits, fromUnits, currentDecimals };
Object.defineProperty(module.exports, 'USDC_DECIMALS', {
  enumerable: true,
  get: currentDecimals,
});

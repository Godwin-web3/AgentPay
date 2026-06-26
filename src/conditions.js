const { ethers } = require('ethers');
require('dotenv').config();
const { fromUnits } = require('../utils/usdc');

/**
 * Fetches metrics from the on-chain vault to verify if conditions are met.
 * Vault USDC accounting uses 6 decimals (see utils/usdc.js).
 */
async function getOnChainMetrics(userAddress) {
  try {
    const { getVaultContract } = require('./escrow');
    const provider = new ethers.JsonRpcProvider(process.env.ARC_RPC, { chainId: 5042002, name: "arc-testnet" });
    const wallet = new ethers.Wallet(process.env.PRIVATE_KEY, provider);
    const contract = await getVaultContract(wallet, userAddress);

    const balance = await contract.getBalance(userAddress);
    const [todaySpent, currentHourTx] = await contract.getSpendMetrics(userAddress);

    return {
      balance: fromUnits(balance),
      todaySpent: fromUnits(todaySpent),
      currentHourTx: Number(currentHourTx)
    };
  } catch (err) {
    console.log('   ⚠️  Could not fetch on-chain metrics: ' + err.message.slice(0, 50));
    return null;
  }
}

function getHour() { return new Date().getHours(); }
function getMinute() { return new Date().getMinutes(); }
function getDayOfWeek() {
  const days = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
  return days[new Date().getDay()];
}
function getDateString() { return new Date().toDateString(); }

function parseExecuteAt(str) {
  if (!str) return null;
  const match = str.match(/^(\d{1,2}):(\d{2})$/);
  if (!match) return null;
  return { hour: parseInt(match[1]), minute: parseInt(match[2]) };
}

async function checkConditions(conditions, job = null, wallet = null) {
  const results = [];
  // Vault on-chain state is keyed to the agent (Circle) wallet address, not the
  // browser address. Prefer job.agentAddress when present.
  const userAddress = job ? (job.agentAddress || job.userAddress) : null;
  
  if (!conditions && (!job || !job.trigger)) return { passed: true, results: [] };

  const metrics = userAddress ? await getOnChainMetrics(userAddress) : null;

  // 1. Balance condition
  if (conditions && conditions.minBalance !== null && conditions.minBalance !== undefined) {
    if (!metrics) {
      results.push({ check: 'balance', passed: false, reason: 'Could not fetch balance' });
    } else if (metrics.balance < conditions.minBalance) {
      results.push({
        check: 'balance',
        passed: false,
        reason: 'Balance ' + metrics.balance.toFixed(4) + ' USDC is below minimum ' + conditions.minBalance + ' USDC'
      });
    } else {
      results.push({ check: 'balance', passed: true, reason: 'Balance ' + metrics.balance.toFixed(4) + ' USDC ✅' });
    }
  }

  // 2. Execute at specific time
  if (conditions && conditions.executeAt) {
    const target = parseExecuteAt(conditions.executeAt);
    if (target) {
      const currentHour = getHour();
      const currentMinute = getMinute();
      const withinWindow = currentHour === target.hour && currentMinute >= target.minute && currentMinute < target.minute + 5;
      if (!withinWindow) {
        results.push({
          check: 'time',
          passed: false,
          reason: 'Not yet ' + conditions.executeAt + ' (current: ' + currentHour + ':' + String(currentMinute).padStart(2, '0') + ')'
        });
      } else {
        results.push({ check: 'time', passed: true, reason: 'Time window matched ✅' });
      }
    }
  }

  // 3. Max daily spend condition
  if (conditions && conditions.maxDailySpend !== null && conditions.maxDailySpend !== undefined) {
    if (!metrics) {
      results.push({ check: 'dailySpend', passed: false, reason: 'Could not fetch spend metrics' });
    } else if (metrics.todaySpent >= conditions.maxDailySpend) {
      results.push({
        check: 'dailySpend',
        passed: false,
        reason: 'On-chain today spend ' + metrics.todaySpent + ' USDC exceeds max ' + conditions.maxDailySpend + ' USDC'
      });
    } else {
      results.push({ check: 'dailySpend', passed: true, reason: 'Daily spend ' + metrics.todaySpent + '/' + conditions.maxDailySpend + ' USDC ✅' });
    }
  }

  // 4. Trigger condition (Pyth-enabled)
  if (job && job.trigger) {
    try {
      const { evaluateTrigger } = require('./triggers');
      const result = await evaluateTrigger(job.trigger);
      if (result.met) {
        results.push({ 
          check: 'trigger', 
          passed: true, 
          reason: 'Trigger verified on Arc ✅', 
          proof: result.proof 
        });
      } else {
        results.push({ 
          check: 'trigger', 
          passed: false, 
          reason: 'Trigger condition not met on-chain', 
          proof: result.proof 
        });
      }
    } catch (err) {
      results.push({ check: 'trigger', passed: false, reason: 'Trigger error: ' + err.message });
    }
  }

  const allPassed = results.every(r => r.passed);
  return { passed: allPassed, results };
}

module.exports = { checkConditions };

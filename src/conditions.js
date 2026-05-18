const { ethers } = require('ethers');
require('dotenv').config();

async function getOnChainMetrics(userAddress) {
  try {
    const { getVaultContract } = require('./escrow');
    const provider = new ethers.JsonRpcProvider(process.env.SOMNIA_RPC_URL);
    const wallet = new ethers.Wallet(process.env.PRIVATE_KEY, provider);
    const contract = getVaultContract(wallet);
    
    const balance = await contract.getBalance(userAddress, ethers.ZeroAddress);
    const [todaySpent, currentHourTx] = await contract.getSpendMetrics(userAddress);
    
    return {
      balance: parseFloat(ethers.formatEther(balance)),
      todaySpent: parseFloat(ethers.formatEther(todaySpent)),
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

async function checkConditions(conditions, userAddress) {
  const results = [];
  if (!conditions) return { passed: true, results: [] };

  const metrics = await getOnChainMetrics(userAddress);

  // 1. Balance condition
  if (conditions.minBalance !== null && conditions.minBalance !== undefined) {
    if (!metrics) {
      results.push({ check: 'balance', passed: false, reason: 'Could not fetch balance' });
    } else if (metrics.balance < conditions.minBalance) {
      results.push({
        check: 'balance',
        passed: false,
        reason: 'Balance ' + metrics.balance.toFixed(4) + ' STT is below minimum ' + conditions.minBalance + ' STT'
      });
    } else {
      results.push({ check: 'balance', passed: true, reason: 'Balance ' + metrics.balance.toFixed(4) + ' STT ✅' });
    }
  }

  // 2. Execute at specific time
  if (conditions.executeAt) {
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
  if (conditions.maxDailySpend !== null && conditions.maxDailySpend !== undefined) {
    if (!metrics) {
      results.push({ check: 'dailySpend', passed: false, reason: 'Could not fetch spend metrics' });
    } else if (metrics.todaySpent >= conditions.maxDailySpend) {
      results.push({
        check: 'dailySpend',
        passed: false,
        reason: 'On-chain today spend ' + metrics.todaySpent + ' STT exceeds max ' + conditions.maxDailySpend + ' STT'
      });
    } else {
      results.push({ check: 'dailySpend', passed: true, reason: 'Daily spend ' + metrics.todaySpent + '/' + conditions.maxDailySpend + ' STT ✅' });
    }
  }

  const allPassed = results.every(r => r.passed);
  return { passed: allPassed, results };
}

module.exports = { checkConditions };

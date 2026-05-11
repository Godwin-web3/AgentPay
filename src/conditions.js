const { ethers } = require('ethers');
require('dotenv').config();

async function getBalance(address) {
  try {
    const provider = new ethers.JsonRpcProvider(process.env.SOMNIA_RPC_URL);
    const balance = await provider.getBalance(address);
    return parseFloat(ethers.formatEther(balance));
  } catch (err) {
    console.log('   ⚠️  Could not fetch balance: ' + err.message.slice(0, 50));
    return null;
  }
}

function getHour() {
  return new Date().getHours();
}

function getMinute() {
  return new Date().getMinutes();
}

function getDayOfWeek() {
  const days = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
  return days[new Date().getDay()];
}

function getDateString() {
  return new Date().toDateString();
}

function parseExecuteAt(str) {
  if (!str) return null;
  const match = str.match(/^(\d{1,2}):(\d{2})$/);
  if (!match) return null;
  return { hour: parseInt(match[1]), minute: parseInt(match[2]) };
}

async function checkConditions(conditions, walletAddress) {
  const results = [];

  if (!conditions) return { passed: true, results: [] };

  // 1. Balance condition
  if (conditions.minBalance !== null && conditions.minBalance !== undefined) {
    const balance = await getBalance(walletAddress);
    if (balance === null) {
      results.push({ check: 'balance', passed: false, reason: 'Could not fetch balance' });
    } else if (balance < conditions.minBalance) {
      results.push({
        check: 'balance',
        passed: false,
        reason: 'Balance ' + balance.toFixed(4) + ' STT is below minimum ' + conditions.minBalance + ' STT'
      });
    } else {
      results.push({
        check: 'balance',
        passed: true,
        reason: 'Balance ' + balance.toFixed(4) + ' STT ✅'
      });
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

  // 3. Execute on specific day
  if (conditions.executeOnDay) {
    const today = getDayOfWeek();
    const target = conditions.executeOnDay.toLowerCase();
    if (today !== target) {
      results.push({
        check: 'day',
        passed: false,
        reason: 'Today is ' + today + ', waiting for ' + target
      });
    } else {
      results.push({ check: 'day', passed: true, reason: 'Day matched: ' + today + ' ✅' });
    }
  }

  // 4. Execute on specific date (tomorrow, specific date)
  if (conditions.executeOnDate) {
    const today = getDateString();
    const target = new Date(conditions.executeOnDate).toDateString();
    if (today !== target) {
      results.push({
        check: 'date',
        passed: false,
        reason: 'Today is ' + today + ', waiting for ' + target
      });
    } else {
      results.push({ check: 'date', passed: true, reason: 'Date matched ✅' });
    }
  }

  // 5. Max daily spend condition
  if (conditions.maxDailySpend !== null && conditions.maxDailySpend !== undefined) {
    const { getTodaySpend } = require('../utils/store');
    const spent = getTodaySpend();
    if (spent >= conditions.maxDailySpend) {
      results.push({
        check: 'dailySpend',
        passed: false,
        reason: 'Already spent ' + spent + ' STT today (max: ' + conditions.maxDailySpend + ' STT)'
      });
    } else {
      results.push({
        check: 'dailySpend',
        passed: true,
        reason: 'Daily spend ' + spent + '/' + conditions.maxDailySpend + ' STT ✅'
      });
    }
  }

  // 6. Execute once (one-time scheduled payment)
  if (conditions.executeOnce && conditions.executed) {
    results.push({
      check: 'executeOnce',
      passed: false,
      reason: 'One-time payment already executed'
    });
  }

  const allPassed = results.every(function(r) { return r.passed; });
  return { passed: allPassed, results };
}

module.exports = { checkConditions };

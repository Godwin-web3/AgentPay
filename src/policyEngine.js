const fs = require('fs');
const path = require('path');
const { getTodaySpend, getLastHourTxCount, getConsecutiveFailures } = require('../utils/store');

class PolicyEngine {
  constructor() {
    this.policyPath = path.join(__dirname, '../config/policy.json');
    this.localPolicy = JSON.parse(fs.readFileSync(this.policyPath, 'utf8'));
    this.paused = false;
    this.pausedUntil = null;
  }

  isPaused() {
    if (!this.paused) return false;
    if (Date.now() > this.pausedUntil) {
      this.paused = false;
      this.pausedUntil = null;
      console.log('⏰ Circuit breaker reset — agent resuming');
      return false;
    }
    const remainingMins = Math.ceil((this.pausedUntil - Date.now()) / 60000);
    console.log('⏸️  Agent paused — ' + remainingMins + ' minute(s) remaining');
    return true;
  }

  triggerCircuitBreaker() {
    this.paused = true;
    this.pausedUntil = Date.now() + 30 * 60 * 1000;
    console.log('🔴 Circuit breaker triggered — agent paused for 30 minutes');
  }

  async check(to, amountUSDC) {
    if (this.isPaused()) {
      return { allowed: false, reason: 'Agent paused — circuit breaker active', code: 'CIRCUIT_BREAKER_ACTIVE' };
    }

    const consecutiveFails = getConsecutiveFailures();
    if (consecutiveFails >= this.localPolicy.circuitBreaker.threshold) {
      this.triggerCircuitBreaker();
      return { allowed: false, reason: 'Too many consecutive failures — agent paused', code: 'CIRCUIT_BREAKER_TRIGGERED' };
    }

    const hour = new Date().getHours();
    if (hour < this.localPolicy.activeHours.start || hour > this.localPolicy.activeHours.end) {
      return { allowed: false, reason: 'Outside active hours (' + this.localPolicy.activeHours.start + ':00 — ' + this.localPolicy.activeHours.end + ':00)', code: 'OUTSIDE_ACTIVE_HOURS' };
    }

    if (amountUSDC > this.localPolicy.maxAmountPerTx) {
      return { allowed: false, reason: 'Amount ' + amountUSDC + ' USDC exceeds per-tx cap of ' + this.localPolicy.maxAmountPerTx + ' USDC', code: 'PER_TX_CAP_EXCEEDED' };
    }

    const whitelist = this.localPolicy.whitelist;
    if (whitelist && whitelist.length > 0) {
      const lowerWhitelist = whitelist.map(a => a.toLowerCase());
      if (!lowerWhitelist.includes(to.toLowerCase())) {
        return { allowed: false, reason: 'Recipient ' + to + ' is not whitelisted', code: 'RECIPIENT_NOT_WHITELISTED' };
      }
    }

    const todaySpend = getTodaySpend();
    if (todaySpend + amountUSDC > this.localPolicy.dailyLimit) {
      return { allowed: false, reason: 'Daily cap reached — spent ' + todaySpend + '/' + this.localPolicy.dailyLimit + ' USDC today', code: 'DAILY_CAP_EXCEEDED' };
    }

    return {
      allowed: true,
      reason: 'All policy checks passed',
      code: 'APPROVED',
      meta: {
        todaySpend: todaySpend + amountUSDC,
        dailyRemaining: this.localPolicy.dailyLimit - todaySpend - amountUSDC
      }
    };
  }

  summary() {
    const todaySpend = getTodaySpend();
    return {
      dailyLimit: this.localPolicy.dailyLimit,
      todaySpent: todaySpend,
      dailyRemaining: this.localPolicy.dailyLimit - todaySpend,
      maxAmountPerTx: this.localPolicy.maxAmountPerTx,
      activeHours: this.localPolicy.activeHours.start + ':00 — ' + this.localPolicy.activeHours.end + ':00',
      whitelist: this.localPolicy.whitelist,
      isPaused: this.isPaused()
    };
  }
}

module.exports = PolicyEngine;

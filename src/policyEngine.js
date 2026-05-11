const fs = require('fs');
const path = require('path');
const { getTodaySpend, getLastHourTxCount, getConsecutiveFailures } = require('../utils/store');

class PolicyEngine {
  constructor(policyPath) {
    this.policyPath = policyPath || path.join(__dirname, '../config/policy.json');
    this.policy = JSON.parse(fs.readFileSync(this.policyPath, 'utf8'));
    this.paused = false;
    this.pausedUntil = null;
  }

  reload() {
    this.policy = JSON.parse(fs.readFileSync(this.policyPath, 'utf8'));
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
    const mins = this.policy.circuitBreaker.pauseDurationMinutes;
    this.pausedUntil = Date.now() + mins * 60 * 1000;
    console.log('🔴 Circuit breaker triggered — agent paused for ' + mins + ' minutes');
  }

  check(to, amountInSTT, reason) {
    reason = reason || '';
    this.reload();

    if (this.isPaused()) {
      return { allowed: false, reason: 'Agent paused — circuit breaker active', code: 'CIRCUIT_BREAKER_ACTIVE' };
    }

    const consecutiveFails = getConsecutiveFailures();
    if (consecutiveFails >= this.policy.circuitBreaker.maxConsecutiveFailures) {
      this.triggerCircuitBreaker();
      return { allowed: false, reason: 'Too many consecutive failures — agent paused', code: 'CIRCUIT_BREAKER_TRIGGERED' };
    }

    const hourlyTx = getLastHourTxCount();
    if (hourlyTx >= this.policy.circuitBreaker.maxTxPerHour) {
      this.triggerCircuitBreaker();
      return { allowed: false, reason: 'Tx velocity too high — ' + hourlyTx + ' tx in last hour', code: 'VELOCITY_EXCEEDED' };
    }

    const hour = new Date().getHours();
    if (hour < this.policy.activeHours.start || hour > this.policy.activeHours.end) {
      return { allowed: false, reason: 'Outside active hours (' + this.policy.activeHours.start + ':00 — ' + this.policy.activeHours.end + ':00)', code: 'OUTSIDE_ACTIVE_HOURS' };
    }

    if (amountInSTT > this.policy.perTxCapSTT) {
      return { allowed: false, reason: 'Amount ' + amountInSTT + ' STT exceeds per-tx cap of ' + this.policy.perTxCapSTT + ' STT', code: 'PER_TX_CAP_EXCEEDED' };
    }

    if (this.policy.allowedRecipients.length > 0) {
      const whitelist = this.policy.allowedRecipients.map(function(a) { return a.toLowerCase(); });
      if (!whitelist.includes(to.toLowerCase())) {
        return { allowed: false, reason: 'Recipient ' + to + ' is not whitelisted', code: 'RECIPIENT_NOT_WHITELISTED' };
      }
    }

    const todaySpend = getTodaySpend();
    if (todaySpend + amountInSTT > this.policy.dailyCapSTT) {
      return { allowed: false, reason: 'Daily cap reached — spent ' + todaySpend + '/' + this.policy.dailyCapSTT + ' STT today', code: 'DAILY_CAP_EXCEEDED' };
    }

    return {
      allowed: true,
      reason: 'All policy checks passed',
      code: 'APPROVED',
      meta: {
        todaySpend: todaySpend + amountInSTT,
        dailyRemaining: this.policy.dailyCapSTT - todaySpend - amountInSTT,
        hourlyTxCount: hourlyTx + 1
      }
    };
  }

  summary() {
    this.reload();
    const todaySpend = getTodaySpend();
    const hourlyTx = getLastHourTxCount();
    const whitelist = this.policy.allowedRecipients;
    return {
      agentName: this.policy.agentName,
      dailyCapSTT: this.policy.dailyCapSTT,
      todaySpent: todaySpend,
      dailyRemaining: this.policy.dailyCapSTT - todaySpend,
      perTxCapSTT: this.policy.perTxCapSTT,
      hourlyTxCount: hourlyTx,
      maxTxPerHour: this.policy.circuitBreaker.maxTxPerHour,
      activeHours: this.policy.activeHours.start + ':00 — ' + this.policy.activeHours.end + ':00',
      whitelistCount: whitelist.length,
      whitelist: whitelist,
      isPaused: this.isPaused()
    };
  }
}

module.exports = PolicyEngine;

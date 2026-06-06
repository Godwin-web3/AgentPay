const fs = require('fs');
const path = require('path');
const { getTodaySpend, getLastHourTxCount, getConsecutiveFailures } = require('../utils/store');
const { getOnChainPolicy } = require('./escrow');

class PolicyEngine {
  constructor(wallet, userAddress) {
    this.wallet = wallet;
    this.userAddress = userAddress;
    this.policyPath = path.join(__dirname, '../config/policy.json');
    this.localPolicy = JSON.parse(fs.readFileSync(this.policyPath, 'utf8'));
    this.onChainPolicy = null;
    this.paused = false;
    this.pausedUntil = null;
  }

  async syncOnChain() {
    if (!this.wallet || !this.userAddress) return;
    try {
      this.onChainPolicy = await getOnChainPolicy(this.wallet, this.userAddress);
      console.log('🔄 Policy synchronized with blockchain');
    } catch (err) {
      console.error('⚠️ Failed to sync policy with blockchain:', err.message);
    }
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
    const mins = this.localPolicy.circuitBreaker.pauseDurationMinutes;
    this.pausedUntil = Date.now() + mins * 60 * 1000;
    console.log('🔴 Circuit breaker triggered — agent paused for ' + mins + ' minutes');
  }

  async check(to, amountInSTT, reason) {
    reason = reason || '';
    
    // Always sync before checking to ensure we have the latest on-chain state
    await this.syncOnChain();

    if (this.isPaused()) {
      return { allowed: false, reason: 'Agent paused — circuit breaker active', code: 'CIRCUIT_BREAKER_ACTIVE' };
    }

    const consecutiveFails = getConsecutiveFailures();
    if (consecutiveFails >= this.localPolicy.circuitBreaker.maxConsecutiveFailures) {
      this.triggerCircuitBreaker();
      return { allowed: false, reason: 'Too many consecutive failures — agent paused', code: 'CIRCUIT_BREAKER_TRIGGERED' };
    }

    // Use on-chain velocity check if available, fallback to local store
    const hourlyTx = this.onChainPolicy ? this.onChainPolicy.currentHourTx : getLastHourTxCount();
    const maxTxPerHour = this.onChainPolicy ? this.onChainPolicy.maxTxPerHour : this.localPolicy.circuitBreaker.maxTxPerHour;

    if (hourlyTx >= maxTxPerHour) {
      this.triggerCircuitBreaker();
      return { allowed: false, reason: 'Tx velocity too high — ' + hourlyTx + ' tx in last hour', code: 'VELOCITY_EXCEEDED' };
    }

    // Active hours are still local for now (agent-side preference)
    const hour = new Date().getHours();
    if (hour < this.localPolicy.activeHours.start || hour > this.localPolicy.activeHours.end) {
      return { allowed: false, reason: 'Outside active hours (' + this.localPolicy.activeHours.start + ':00 — ' + this.localPolicy.activeHours.end + ':00)', code: 'OUTSIDE_ACTIVE_HOURS' };
    }

    // Use on-chain caps
    const perTxCap = this.onChainPolicy ? this.onChainPolicy.perTxCap : this.localPolicy.perTxCapSTT;
    if (amountInSTT > perTxCap) {
      return { allowed: false, reason: 'Amount ' + amountInSTT + ' STT exceeds per-tx cap of ' + perTxCap + ' STT', code: 'PER_TX_CAP_EXCEEDED' };
    }

    // On-chain whitelist
    const whitelist = this.onChainPolicy ? this.onChainPolicy.whitelist : this.localPolicy.allowedRecipients;
    if (whitelist && whitelist.length > 0) {
      const lowerWhitelist = whitelist.map(a => a.toLowerCase());
      if (!lowerWhitelist.includes(to.toLowerCase())) {
        return { allowed: false, reason: 'Recipient ' + to + ' is not whitelisted', code: 'RECIPIENT_NOT_WHITELISTED' };
      }
    }

    // On-chain daily cap
    const dailyCap = this.onChainPolicy ? this.onChainPolicy.dailyCap : this.localPolicy.dailyCapSTT;
    const todaySpend = this.onChainPolicy ? this.onChainPolicy.todaySpent : getTodaySpend();
    
    if (todaySpend + amountInSTT > dailyCap) {
      return { allowed: false, reason: 'Daily cap reached — spent ' + todaySpend + '/' + dailyCap + ' STT today', code: 'DAILY_CAP_EXCEEDED' };
    }

    return {
      allowed: true,
      reason: 'All policy checks passed',
      code: 'APPROVED',
      meta: {
        todaySpend: todaySpend + amountInSTT,
        dailyRemaining: dailyCap - todaySpend - amountInSTT,
        hourlyTxCount: hourlyTx + 1
      }
    };
  }

  async summary() {
    await this.syncOnChain();
    const todaySpend = this.onChainPolicy ? this.onChainPolicy.todaySpent : getTodaySpend();
    const dailyCap = this.onChainPolicy ? this.onChainPolicy.dailyCap : this.localPolicy.dailyCapSTT;
    const perTxCap = this.onChainPolicy ? this.onChainPolicy.perTxCap : this.localPolicy.perTxCapSTT;
    const hourlyTx = this.onChainPolicy ? this.onChainPolicy.currentHourTx : getLastHourTxCount();
    const maxTxPerHour = this.onChainPolicy ? this.onChainPolicy.maxTxPerHour : this.localPolicy.circuitBreaker.maxTxPerHour;
    const whitelist = this.onChainPolicy ? this.onChainPolicy.whitelist : this.localPolicy.allowedRecipients;

    return {
      agentName: this.localPolicy.agentName,
      dailyCapSTT: dailyCap,
      todaySpent: todaySpend,
      dailyRemaining: dailyCap - todaySpend,
      perTxCapSTT: perTxCap,
      hourlyTxCount: hourlyTx,
      maxTxPerHour: maxTxPerHour,
      activeHours: this.localPolicy.activeHours.start + ':00 — ' + this.localPolicy.activeHours.end + ':00',
      whitelistCount: whitelist.length,
      whitelist: whitelist,
      isPaused: this.isPaused(),
      source: this.onChainPolicy ? 'blockchain' : 'local'
    };
  }
}

module.exports = PolicyEngine;

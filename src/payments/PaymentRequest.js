/**
 * PaymentRequest
 *
 * Structured intent for "request payment" flows from the white paper.
 * Creating or sharing a request does not move funds.
 * Settlement still requires the payer to authorize via AgentVault
 * (execute or executeWithSig) or an equivalent on-chain policy check.
 *
 * States: created -> shared -> reviewed -> authorized -> settled | expired | cancelled | failed
 */

const { randomUUID } = require('crypto');

class PaymentRequest {
  constructor({
    id = randomUUID(),
    from,          // payer address or identifier
    to,            // recipient address
    amount,
    asset = 'USDC',
    network = 'arc',
    description = '',
    expiresAt = null,
    conditions = [],
  }) {
    this.id = id;
    this.from = from;
    this.to = to;
    this.amount = amount;
    this.asset = asset;
    this.network = network;
    this.description = description;
    this.expiresAt = expiresAt;
    this.conditions = conditions;
    this.state = 'created';
    this.createdAt = Date.now();
    this.requestId = null; // set when AgentVault execution is prepared
    this.txHash = null;
    this.settledAt = null;
  }

  share() {
    if (this.state !== 'created') throw new Error('cannot share from ' + this.state);
    this.state = 'shared';
    return this;
  }

  review() {
    if (this.state !== 'shared') throw new Error('cannot review from ' + this.state);
    this.state = 'reviewed';
    return this;
  }

  authorize(requestId) {
    if (this.state !== 'reviewed') throw new Error('cannot authorize from ' + this.state);
    this.requestId = requestId;
    this.state = 'authorized';
    return this;
  }

  settle(txHash) {
    if (this.state !== 'authorized') throw new Error('cannot settle from ' + this.state);
    this.txHash = txHash;
    this.settledAt = Date.now();
    this.state = 'settled';
    return this;
  }

  expire() {
    if (['settled', 'cancelled'].includes(this.state)) return this;
    this.state = 'expired';
    return this;
  }

  cancel() {
    if (this.state === 'settled') throw new Error('already settled');
    this.state = 'cancelled';
    return this;
  }

  fail(reason) {
    this.state = 'failed';
    this.failureReason = reason;
    return this;
  }

  toJSON() {
    return {
      id: this.id,
      from: this.from,
      to: this.to,
      amount: this.amount,
      asset: this.asset,
      network: this.network,
      description: this.description,
      expiresAt: this.expiresAt,
      state: this.state,
      requestId: this.requestId,
      txHash: this.txHash,
      createdAt: this.createdAt,
      settledAt: this.settledAt,
    };
  }
}

module.exports = { PaymentRequest };

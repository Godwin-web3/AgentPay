/**
 * ExecutionAdapter
 *
 * Planners and the intent layer may only call propose() or estimate().
 * Only an authorized caller (the registered agent or a signed executeWithSig path)
 * may call execute(). Every execute path that moves user funds must still
 * route through AgentVault or an equivalent on-chain policy check.
 *
 * This interface does not grant authority. It standardizes how different
 * settlement providers are described and invoked.
 */

class ExecutionAdapter {
  constructor({ name, supportedAssets = [], supportedNetworks = [] }) {
    this.name = name;
    this.supportedAssets = supportedAssets;
    this.supportedNetworks = supportedNetworks;
  }

  /**
   * Return a structured proposal the planner can score.
   * Must not move funds or require a private key.
   */
  async propose(intent) {
    throw new Error(`${this.name}: propose() not implemented`);
  }

  /**
   * Estimate cost, latency, and success probability without side effects.
   */
  async estimate(intent) {
    throw new Error(`${this.name}: estimate() not implemented`);
  }

  /**
   * Execute only after AgentVault (or equivalent) has already authorized
   * the amount and recipient. The adapter receives a pre-authorized
   * requestId and must not re-check policy itself.
   */
  async execute(authorizedIntent) {
    throw new Error(`${this.name}: execute() not implemented`);
  }

  supports(intent) {
    const assetOk = this.supportedAssets.length === 0 ||
      this.supportedAssets.includes(intent.asset);
    const networkOk = this.supportedNetworks.length === 0 ||
      this.supportedNetworks.includes(intent.network);
    return assetOk && networkOk;
  }
}

module.exports = { ExecutionAdapter };

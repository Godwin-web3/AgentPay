// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/**
 * @title DecisionLog
 * @dev On-chain provenance log for AgentPay's off-chain AI decisions.
 *
 * Honest scope: this does NOT prove the LLM inference itself was run
 * correctly or without tampering (that would require verifiable/decentralized
 * inference — see src/arcAi.js, which is an explicit stub because that
 * infrastructure isn't confirmed against docs.arc.network). What this DOES
 * give you, for real, today:
 *
 *  - Every AI-derived action (a payment, a hire, a plan step) is committed
 *    on-chain BEFORE it is executed, keyed by the same `requestId` used in
 *    AgentVault.execute/executeWithSig.
 *  - The commit is a hash of the full decision record (goal, plan, chosen
 *    action, parameters) that the operator publishes off-chain. Anyone can
 *    recompute the hash from the published record and compare it to what's
 *    on-chain — if they differ, the operator rewrote history after the fact.
 *  - Block-ordering makes "we decided this after we saw the outcome"
 *    provably false: the commit's block number is always <= the
 *    corresponding AgentVault Executed event's block number.
 *  - finalize() lets the operator record the real on-chain outcome
 *    (success/failure/tx hash, hashed) next to the original decision, so a
 *    reader can see whether the plan matched reality.
 *
 * In short: verifiable decision PROVENANCE, not verifiable INFERENCE. The
 * two are different claims and this contract only makes the first one.
 */
contract DecisionLog {
    address public owner;
    address public agent;
    address public pendingAgent;

    struct Decision {
        bytes32 decisionHash;   // keccak256 of the published off-chain decision record
        bytes32 outcomeHash;    // keccak256 of the published off-chain outcome record
        uint64 committedAt;
        uint64 committedBlock;
        uint64 finalizedAt;
        bool finalized;
        string summary;         // short human-readable label, e.g. "pay 5 USDC to 0x.. for job #42"
    }

    mapping(bytes32 => Decision) public decisions;

    event DecisionCommitted(bytes32 indexed requestId, bytes32 decisionHash, string summary, uint64 blockNumber);
    event DecisionFinalized(bytes32 indexed requestId, bytes32 outcomeHash);
    event AgentUpdated(address indexed newAgent);
    event PendingAgentProposed(address indexed pendingAgent);

    error NotOwner();
    error NotAgent();
    error NotPendingAgent();
    error ZeroAddress();
    error AlreadyCommitted();
    error NotCommitted();
    error AlreadyFinalized();

    modifier onlyOwner() {
        if (msg.sender != owner) revert NotOwner();
        _;
    }

    modifier onlyAgent() {
        if (msg.sender != agent) revert NotAgent();
        _;
    }

    constructor(address _agent) {
        if (_agent == address(0)) revert ZeroAddress();
        owner = msg.sender;
        agent = _agent;
    }

    // ── Agent rotation (mirrors AgentVault's two-step pattern) ─────────────

    function proposeAgent(address _newAgent) external onlyOwner {
        if (_newAgent == address(0)) revert ZeroAddress();
        pendingAgent = _newAgent;
        emit PendingAgentProposed(_newAgent);
    }

    function acceptAgent() external {
        if (msg.sender != pendingAgent) revert NotPendingAgent();
        agent = pendingAgent;
        pendingAgent = address(0);
        emit AgentUpdated(agent);
    }

    // ── Core log ─────────────────────────────────────────────────────────

    /**
     * Commit a decision BEFORE the corresponding AgentVault execution.
     * requestId must be the exact bytes32 passed to AgentVault.execute /
     * executeWithSig, so the two can be cross-referenced.
     */
    function commit(bytes32 requestId, bytes32 decisionHash, string calldata summary) external onlyAgent {
        if (decisions[requestId].committedAt != 0) revert AlreadyCommitted();
        decisions[requestId] = Decision({
            decisionHash: decisionHash,
            outcomeHash: bytes32(0),
            committedAt: uint64(block.timestamp),
            committedBlock: uint64(block.number),
            finalizedAt: 0,
            finalized: false,
            summary: summary
        });
        emit DecisionCommitted(requestId, decisionHash, summary, uint64(block.number));
    }

    /**
     * Record the real outcome next to the original decision. Non-authoritative
     * (the operator writes this), but it's on the same append-only log as the
     * commit, so a reader can see if it's ever missing or contradicts the
     * AgentVault event for the same requestId.
     */
    function finalize(bytes32 requestId, bytes32 outcomeHash) external onlyAgent {
        Decision storage d = decisions[requestId];
        if (d.committedAt == 0) revert NotCommitted();
        if (d.finalized) revert AlreadyFinalized();
        d.outcomeHash = outcomeHash;
        d.finalizedAt = uint64(block.timestamp);
        d.finalized = true;
        emit DecisionFinalized(requestId, outcomeHash);
    }

    function getDecision(bytes32 requestId) external view returns (Decision memory) {
        return decisions[requestId];
    }

    function verify(bytes32 requestId, bytes32 expectedDecisionHash) external view returns (bool) {
        return decisions[requestId].committedAt != 0 && decisions[requestId].decisionHash == expectedDecisionHash;
    }
}

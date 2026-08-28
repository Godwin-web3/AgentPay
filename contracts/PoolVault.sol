// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "./AgentVault.sol"; // reuses IERC20 + ReentrancyGuard declared there

/**
 * @title PoolVault
 * @dev Singleton multi-tenant vault for shared-money pools (roommates, small
 * teams, trip funds, whoever). Deliberately NOT a factory that deploys a new
 * contract per pool — every pool is an internal record in this one contract's
 * storage, keyed by poolId. Creating a pool is a cheap state write, not a
 * ~500k+ gas contract deployment, and every pool shares one audited core
 * instead of N separately-deployed copies that all have to be trusted
 * individually. (Personal AgentVault instances are untouched — this is a
 * separate, additive system for pools only.)
 *
 * One governance primitive, reused three ways: propose() -> members are
 * notified off-chain -> silence within the objection window is consent,
 * OR any member calls veto() and it's blocked on-chain (the operator/agent
 * cannot execute past a real veto, same trust-minimization principle as
 * AgentVault's per-tx/daily caps, extended from one owner to many members).
 * The same propose/veto/resolve path handles a discretionary spend, a
 * constitution amendment, and a member removal.
 *
 * Every member's personal allowance is a separate, untouchable bucket: no
 * proposal, no veto, no agent involvement needed to spend your own personal
 * balance — it is simply yours.
 */
contract PoolVault is ReentrancyGuard {
    address public owner;
    address public agent;
    address public usdc;

    enum ProposalKind { Spend, AmendConstitution, RemoveMember, AddMember }
    enum MemberStatus { None, Invited, Active }

    struct Constitution {
        uint256 discretionaryThreshold; // spend from the shared pool above this needs a proposal
        uint256 objectionWindow;        // seconds a proposal sits before it can be resolved
        uint256 maxSingleProposal;      // hard backstop cap; no proposal, ever, can exceed this
    }

    struct Pool {
        address founder;
        address[] memberList;
        Constitution constitution;
        uint256 sharedBalance;
        uint256 nextProposalId;
        bool active;
    }

    struct Proposal {
        uint256 poolId;
        address proposer;
        ProposalKind kind;
        address to;              // Spend target
        uint256 amount;          // Spend amount / unused for others
        string reason;
        Constitution newConstitution; // AmendConstitution payload
        address targetMember;    // RemoveMember / AddMember payload
        uint256 createdAt;
        uint256 windowEnds;
        bool vetoed;
        bool resolved;
        bool executed;
    }

    uint256 public nextPoolId = 1;
    mapping(uint256 => Pool) private pools;
    mapping(uint256 => mapping(address => MemberStatus)) public memberStatus;
    mapping(uint256 => mapping(address => uint256)) public personalBalance;

    uint256 public nextProposalId = 1;
    mapping(uint256 => Proposal) public proposals;
    mapping(uint256 => mapping(address => bool)) public hasVetoed;

    event PoolCreated(uint256 indexed poolId, address indexed founder);
    event MemberInvited(uint256 indexed poolId, address indexed member);
    event MemberJoined(uint256 indexed poolId, address indexed member);
    event MemberLeft(uint256 indexed poolId, address indexed member);
    event Contributed(uint256 indexed poolId, address indexed member, uint256 amount, bool toShared);
    event PersonalWithdrawn(uint256 indexed poolId, address indexed member, uint256 amount);
    event ProposalCreated(uint256 indexed poolId, uint256 indexed proposalId, ProposalKind kind, uint256 windowEnds);
    event ProposalVetoed(uint256 indexed proposalId, address indexed by);
    event ProposalResolved(uint256 indexed proposalId, bool executed);

    error NotOwner();
    error NotAgent();
    error NotMember();
    error NotFounder();
    error NotInvited();
    error AlreadyMember();
    error PoolInactive();
    error ZeroAddress();
    error InsufficientBalance();
    error ExceedsBackstopCap();
    error TransferFailed();
    error WindowNotElapsed();
    error AlreadyResolved();
    error ProposalVetoedError();
    error AlreadyVetoed();
    error ProposerNotMember();

    modifier onlyOwner() {
        if (msg.sender != owner) revert NotOwner();
        _;
    }

    modifier onlyAgent() {
        if (msg.sender != agent) revert NotAgent();
        _;
    }

    modifier onlyActiveMember(uint256 poolId) {
        if (!pools[poolId].active) revert PoolInactive();
        if (memberStatus[poolId][msg.sender] != MemberStatus.Active) revert NotMember();
        _;
    }

    constructor(address _agent, address _usdc) {
        if (_agent == address(0) || _usdc == address(0)) revert ZeroAddress();
        owner = msg.sender;
        agent = _agent;
        usdc = _usdc;
    }

    // ── Pool lifecycle ───────────────────────────────────────────────────

    function createPool(address[] calldata invites, Constitution calldata constitution) external returns (uint256 poolId) {
        poolId = nextPoolId++;
        Pool storage p = pools[poolId];
        p.founder = msg.sender;
        p.constitution = constitution;
        p.active = true;
        p.memberList.push(msg.sender);
        memberStatus[poolId][msg.sender] = MemberStatus.Active;

        for (uint256 i = 0; i < invites.length; i++) {
            if (invites[i] == address(0)) revert ZeroAddress();
            memberStatus[poolId][invites[i]] = MemberStatus.Invited;
            emit MemberInvited(poolId, invites[i]);
        }

        emit PoolCreated(poolId, msg.sender);
    }

    // Invitees must explicitly opt in — nobody is ever silently bound to a
    // pool's constitution.
    function acceptInvite(uint256 poolId) external {
        if (memberStatus[poolId][msg.sender] != MemberStatus.Invited) revert NotInvited();
        memberStatus[poolId][msg.sender] = MemberStatus.Active;
        pools[poolId].memberList.push(msg.sender);
        emit MemberJoined(poolId, msg.sender);
    }

    // Leaving is always unilateral: withdraw your own personal balance first,
    // then leave. No permission needed from anyone else.
    function leavePool(uint256 poolId) external onlyActiveMember(poolId) {
        memberStatus[poolId][msg.sender] = MemberStatus.None;
        emit MemberLeft(poolId, msg.sender);
    }

    function getPool(uint256 poolId) external view returns (
        address founder,
        address[] memory memberList,
        Constitution memory constitution,
        uint256 sharedBalance,
        bool active
    ) {
        Pool storage p = pools[poolId];
        return (p.founder, p.memberList, p.constitution, p.sharedBalance, p.active);
    }

    // ── Funding ──────────────────────────────────────────────────────────

    function contribute(uint256 poolId, uint256 amount, bool toShared) external nonReentrant onlyActiveMember(poolId) {
        bool ok = IERC20(usdc).transferFrom(msg.sender, address(this), amount);
        if (!ok) revert TransferFailed();

        if (toShared) {
            pools[poolId].sharedBalance += amount;
        } else {
            personalBalance[poolId][msg.sender] += amount;
        }
        emit Contributed(poolId, msg.sender, amount, toShared);
    }

    // Your personal allowance is simply yours: no proposal, no veto, no
    // agent involvement required to take it back out.
    function withdrawPersonal(uint256 poolId, uint256 amount) external nonReentrant onlyActiveMember(poolId) {
        if (personalBalance[poolId][msg.sender] < amount) revert InsufficientBalance();
        personalBalance[poolId][msg.sender] -= amount;
        bool ok = IERC20(usdc).transfer(msg.sender, amount);
        if (!ok) revert TransferFailed();
        emit PersonalWithdrawn(poolId, msg.sender, amount);
    }

    // ── The one governance primitive, used three ways ──────────────────────

    function proposeSpend(uint256 poolId, address proposer, address to, uint256 amount, string calldata reason)
        external onlyAgent returns (uint256 proposalId)
    {
        Pool storage p = pools[poolId];
        if (!p.active) revert PoolInactive();
        if (memberStatus[poolId][proposer] != MemberStatus.Active) revert ProposerNotMember();
        if (amount > p.constitution.maxSingleProposal) revert ExceedsBackstopCap();
        if (amount > p.sharedBalance) revert InsufficientBalance();

        proposalId = _createProposal(poolId, proposer, ProposalKind.Spend, p.constitution.objectionWindow);
        Proposal storage prop = proposals[proposalId];
        prop.to = to;
        prop.amount = amount;
        prop.reason = reason;

        // Below the discretionary threshold: no waiting, resolves immediately.
        if (amount <= p.constitution.discretionaryThreshold) {
            _executeSpend(poolId, proposalId, to, amount);
        }
    }

    function proposeAmendConstitution(uint256 poolId, address proposer, Constitution calldata newConstitution)
        external onlyAgent returns (uint256 proposalId)
    {
        Pool storage p = pools[poolId];
        if (!p.active) revert PoolInactive();
        if (memberStatus[poolId][proposer] != MemberStatus.Active) revert ProposerNotMember();
        proposalId = _createProposal(poolId, proposer, ProposalKind.AmendConstitution, p.constitution.objectionWindow);
        proposals[proposalId].newConstitution = newConstitution;
    }

    function proposeRemoveMember(uint256 poolId, address proposer, address targetMember)
        external onlyAgent returns (uint256 proposalId)
    {
        Pool storage p = pools[poolId];
        if (!p.active) revert PoolInactive();
        if (memberStatus[poolId][proposer] != MemberStatus.Active) revert ProposerNotMember();
        proposalId = _createProposal(poolId, proposer, ProposalKind.RemoveMember, p.constitution.objectionWindow);
        proposals[proposalId].targetMember = targetMember;
    }

    function _createProposal(uint256 poolId, address proposer, ProposalKind kind, uint256 window) internal returns (uint256 proposalId) {
        proposalId = nextProposalId++;
        Proposal storage prop = proposals[proposalId];
        prop.poolId = poolId;
        prop.proposer = proposer;
        prop.kind = kind;
        prop.createdAt = block.timestamp;
        prop.windowEnds = block.timestamp + window;
        emit ProposalCreated(poolId, proposalId, kind, prop.windowEnds);
    }

    // Any active member can veto within the window. Real on-chain block —
    // the agent cannot execute past this no matter what the off-chain UI shows.
    function veto(uint256 proposalId) external {
        Proposal storage prop = proposals[proposalId];
        if (memberStatus[prop.poolId][msg.sender] != MemberStatus.Active) revert NotMember();
        if (prop.resolved) revert AlreadyResolved();
        if (hasVetoed[proposalId][msg.sender]) revert AlreadyVetoed();
        hasVetoed[proposalId][msg.sender] = true;
        prop.vetoed = true;
        emit ProposalVetoed(proposalId, msg.sender);
    }

    // Called by the agent/keeper once the objection window has elapsed.
    // Reverts if vetoed — there is no path to execute a vetoed proposal.
    function resolveProposal(uint256 proposalId) external onlyAgent nonReentrant {
        Proposal storage prop = proposals[proposalId];
        if (prop.resolved) revert AlreadyResolved();
        if (block.timestamp < prop.windowEnds) revert WindowNotElapsed();
        if (prop.vetoed) revert ProposalVetoedError();

        prop.resolved = true;

        if (prop.kind == ProposalKind.Spend) {
            _executeSpend(prop.poolId, proposalId, prop.to, prop.amount);
        } else if (prop.kind == ProposalKind.AmendConstitution) {
            pools[prop.poolId].constitution = prop.newConstitution;
            prop.executed = true;
        } else if (prop.kind == ProposalKind.RemoveMember) {
            memberStatus[prop.poolId][prop.targetMember] = MemberStatus.None;
            prop.executed = true;
        }

        emit ProposalResolved(proposalId, prop.executed);
    }

    function _executeSpend(uint256 poolId, uint256 proposalId, address to, uint256 amount) internal {
        Pool storage p = pools[poolId];
        if (p.sharedBalance < amount) revert InsufficientBalance();
        p.sharedBalance -= amount;
        bool ok = IERC20(usdc).transfer(to, amount);
        if (!ok) revert TransferFailed();

        Proposal storage prop = proposals[proposalId];
        prop.resolved = true;
        prop.executed = true;
        emit ProposalResolved(proposalId, true);
    }

    function getProposal(uint256 proposalId) external view returns (
        uint256 poolId,
        ProposalKind kind,
        address to,
        uint256 amount,
        string memory reason,
        uint256 windowEnds,
        bool vetoed,
        bool resolved,
        bool executed
    ) {
        Proposal storage p = proposals[proposalId];
        return (p.poolId, p.kind, p.to, p.amount, p.reason, p.windowEnds, p.vetoed, p.resolved, p.executed);
    }

    // ── Admin ────────────────────────────────────────────────────────────

    function setAgent(address _agent) external onlyOwner {
        if (_agent == address(0)) revert ZeroAddress();
        agent = _agent;
    }
}

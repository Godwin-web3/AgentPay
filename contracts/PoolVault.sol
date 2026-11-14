// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "./AgentVault.sol"; // reuses IERC20 + ReentrancyGuard declared there

/**
 * @title PoolVault
 * @dev Singleton multi-tenant vault for shared-money pools.
 *
 * Governance proposals are authorized by a member EIP-712 signature. The agent
 * may relay that signature, but it cannot manufacture one. Every shared spend
 * waits out the objection window. Pausing a pool freezes that window.
 */
contract PoolVault is ReentrancyGuard {
    address public owner;
    address public agent;
    address public usdc;

    bytes32 private constant _DOMAIN_TYPEHASH =
        keccak256("EIP712Domain(string name,string version,uint256 chainId,address verifyingContract)");
    bytes32 private constant _PROPOSAL_TYPEHASH = keccak256(
        "PoolProposal(uint256 poolId,address proposer,uint8 kind,address to,uint256 amount,bytes32 reasonHash,uint256 discretionaryThreshold,uint256 objectionWindow,uint256 maxSingleProposal,address targetMember,uint256 nonce,uint256 deadline)"
    );
    bytes32 private constant _NAME_HASH = keccak256("PoolVault");
    bytes32 private constant _VERSION_HASH = keccak256("1");
    uint256 private constant _SECP256K1N_HALF =
        0x7fffffffffffffffffffffffffffffff5d576e7357a4501ddfe92f46681b20a0;

    enum ProposalKind { Spend, AmendConstitution, RemoveMember, AddMember }
    enum MemberStatus { None, Invited, Active }

    struct Constitution {
        uint256 discretionaryThreshold;
        uint256 objectionWindow;
        uint256 maxSingleProposal;
    }

    struct Pool {
        address founder;
        address[] memberList;
        Constitution constitution;
        uint256 sharedBalance;
        uint256 nextProposalId;
        bool active;
        bool paused;
        uint256 pauseStartedAt;
        uint256 pausedAccumulated;
    }

    struct Proposal {
        uint256 poolId;
        address proposer;
        ProposalKind kind;
        address to;
        uint256 amount;
        string reason;
        Constitution newConstitution;
        address targetMember;
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
    mapping(uint256 => mapping(address => uint256)) public proposalNonces;

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
    event PoolPaused(uint256 indexed poolId);
    event PoolResumed(uint256 indexed poolId);
    event AgentUpdated(address indexed newAgent);
    event OwnerUpdated(address indexed newOwner);

    error NotOwner();
    error NotAgent();
    error NotMember();
    error NotInvited();
    error PoolInactive();
    error PoolPausedError();
    error ZeroAddress();
    error InsufficientBalance();
    error ExceedsBackstopCap();
    error TransferFailed();
    error WindowNotElapsed();
    error VetoWindowClosed();
    error AlreadyResolved();
    error ProposalVetoedError();
    error AlreadyVetoed();
    error ProposerNotMember();
    error InvalidSignature();
    error SignatureExpired();
    error ProposalNotFound();
    error InvalidConstitution();
    error NotPaused();

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
        if (pools[poolId].paused) revert PoolPausedError();
        if (memberStatus[poolId][msg.sender] != MemberStatus.Active) revert NotMember();
        _;
    }

    constructor(address _agent, address _usdc) {
        if (_agent == address(0) || _usdc == address(0)) revert ZeroAddress();
        owner = msg.sender;
        agent = _agent;
        usdc = _usdc;
    }

    function domainSeparator() public view returns (bytes32) {
        return keccak256(abi.encode(
            _DOMAIN_TYPEHASH, _NAME_HASH, _VERSION_HASH, block.chainid, address(this)
        ));
    }

    function _clock(Pool storage p) internal view returns (uint256) {
        if (p.pauseStartedAt != 0) return p.pauseStartedAt - p.pausedAccumulated;
        return block.timestamp - p.pausedAccumulated;
    }

    function _wallFromClock(Pool storage p, uint256 clockTime) internal view returns (uint256) {
        uint256 extra = p.pausedAccumulated;
        if (p.pauseStartedAt != 0) extra += block.timestamp - p.pauseStartedAt;
        return clockTime + extra;
    }

    function createPool(address[] calldata invites, Constitution calldata constitution)
        external returns (uint256 poolId)
    {
        _validateConstitution(constitution);
        poolId = nextPoolId++;
        Pool storage p = pools[poolId];
        p.founder = msg.sender;
        p.constitution = constitution;
        p.active = true;
        p.memberList.push(msg.sender);
        memberStatus[poolId][msg.sender] = MemberStatus.Active;

        for (uint256 i = 0; i < invites.length; i++) {
            address invite = invites[i];
            if (invite == address(0) || invite == msg.sender) revert ZeroAddress();
            if (memberStatus[poolId][invite] != MemberStatus.None) revert InvalidSignature();
            memberStatus[poolId][invite] = MemberStatus.Invited;
            emit MemberInvited(poolId, invite);
        }
        emit PoolCreated(poolId, msg.sender);
    }

    function acceptInvite(uint256 poolId) external {
        if (!pools[poolId].active) revert PoolInactive();
        if (pools[poolId].paused) revert PoolPausedError();
        if (memberStatus[poolId][msg.sender] != MemberStatus.Invited) revert NotInvited();
        memberStatus[poolId][msg.sender] = MemberStatus.Active;
        pools[poolId].memberList.push(msg.sender);
        emit MemberJoined(poolId, msg.sender);
    }

    function leavePool(uint256 poolId) external onlyActiveMember(poolId) {
        memberStatus[poolId][msg.sender] = MemberStatus.None;
        emit MemberLeft(poolId, msg.sender);
    }

    function getPool(uint256 poolId) external view returns (
        address founder, address[] memory memberList, Constitution memory constitution,
        uint256 sharedBalance, bool active
    ) {
        Pool storage p = pools[poolId];
        return (p.founder, p.memberList, p.constitution, p.sharedBalance, p.active);
    }

    function contribute(uint256 poolId, uint256 amount, bool toShared)
        external nonReentrant onlyActiveMember(poolId)
    {
        uint256 beforeBalance = IERC20(usdc).balanceOf(address(this));
        bool ok = IERC20(usdc).transferFrom(msg.sender, address(this), amount);
        if (!ok) revert TransferFailed();
        uint256 received = IERC20(usdc).balanceOf(address(this)) - beforeBalance;
        if (toShared) pools[poolId].sharedBalance += received;
        else personalBalance[poolId][msg.sender] += received;
        emit Contributed(poolId, msg.sender, received, toShared);
    }

    // Personal funds belong to the depositor, not the pool. Leaving, being
    // removed, or a pause must not trap them.
    function withdrawPersonal(uint256 poolId, uint256 amount)
        external nonReentrant
    {
        if (amount == 0 || personalBalance[poolId][msg.sender] < amount) revert InsufficientBalance();
        personalBalance[poolId][msg.sender] -= amount;
        bool ok = IERC20(usdc).transfer(msg.sender, amount);
        if (!ok) revert TransferFailed();
        emit PersonalWithdrawn(poolId, msg.sender, amount);
    }

    function proposeSpend(
        uint256 poolId, address proposer, address to, uint256 amount, string calldata reason,
        uint256 deadline, bytes calldata signature
    ) external nonReentrant returns (uint256 proposalId) {
        Pool storage p = pools[poolId];
        if (!p.active) revert PoolInactive();
        if (p.paused) revert PoolPausedError();
        if (memberStatus[poolId][proposer] != MemberStatus.Active) revert ProposerNotMember();
        if (msg.sender != proposer && msg.sender != agent) revert NotAgent();
        Constitution memory rules = p.constitution;
        _authorizeProposal(
            poolId, proposer, ProposalKind.Spend, to, amount, keccak256(bytes(reason)),
            rules.discretionaryThreshold, rules.objectionWindow, rules.maxSingleProposal,
            address(0), deadline, signature
        );
        if (to == address(0)) revert ZeroAddress();
        if (amount == 0 || amount > rules.maxSingleProposal) revert ExceedsBackstopCap();
        if (amount > p.sharedBalance) revert InsufficientBalance();

        proposalId = _createProposal(poolId, proposer, ProposalKind.Spend, rules.objectionWindow);
        Proposal storage prop = proposals[proposalId];
        prop.to = to;
        prop.amount = amount;
        prop.reason = reason;
    }

    function proposeAmendConstitution(
        uint256 poolId, address proposer, Constitution calldata newConstitution,
        uint256 deadline, bytes calldata signature
    ) external returns (uint256 proposalId) {
        Pool storage p = pools[poolId];
        if (!p.active) revert PoolInactive();
        if (p.paused) revert PoolPausedError();
        if (memberStatus[poolId][proposer] != MemberStatus.Active) revert ProposerNotMember();
        _validateConstitution(newConstitution);
        if (msg.sender != proposer && msg.sender != agent) revert NotAgent();
        _authorizeProposal(
            poolId, proposer, ProposalKind.AmendConstitution, address(0), 0, bytes32(0),
            newConstitution.discretionaryThreshold, newConstitution.objectionWindow,
            newConstitution.maxSingleProposal, address(0), deadline, signature
        );
        proposalId = _createProposal(poolId, proposer, ProposalKind.AmendConstitution, p.constitution.objectionWindow);
        proposals[proposalId].newConstitution = newConstitution;
    }

    function proposeRemoveMember(
        uint256 poolId, address proposer, address targetMember,
        uint256 deadline, bytes calldata signature
    ) external returns (uint256 proposalId) {
        Pool storage p = pools[poolId];
        if (!p.active) revert PoolInactive();
        if (p.paused) revert PoolPausedError();
        if (memberStatus[poolId][proposer] != MemberStatus.Active) revert ProposerNotMember();
        if (memberStatus[poolId][targetMember] != MemberStatus.Active || targetMember == p.founder) revert NotMember();
        if (msg.sender != proposer && msg.sender != agent) revert NotAgent();
        _authorizeProposal(
            poolId, proposer, ProposalKind.RemoveMember, address(0), 0, bytes32(0),
            0, 0, 0, targetMember, deadline, signature
        );
        proposalId = _createProposal(poolId, proposer, ProposalKind.RemoveMember, p.constitution.objectionWindow);
        proposals[proposalId].targetMember = targetMember;
    }

    function _authorizeProposal(
        uint256 poolId, address proposer, ProposalKind kind, address to, uint256 amount,
        bytes32 reasonHash, uint256 discretionaryThreshold, uint256 objectionWindow,
        uint256 maxSingleProposal, address targetMember, uint256 deadline, bytes calldata signature
    ) internal {
        if (block.timestamp > deadline) revert SignatureExpired();
        uint256 nonce = proposalNonces[poolId][proposer];
        bytes32 structHash = keccak256(abi.encode(
            _PROPOSAL_TYPEHASH, poolId, proposer, uint8(kind), to, amount, reasonHash,
            discretionaryThreshold, objectionWindow, maxSingleProposal, targetMember, nonce, deadline
        ));
        bytes32 digest = keccak256(abi.encodePacked("\x19\x01", domainSeparator(), structHash));
        if (!_validSignature(digest, proposer, signature)) revert InvalidSignature();
        proposalNonces[poolId][proposer] = nonce + 1;
    }

    function _validSignature(bytes32 digest, address expected, bytes calldata signature)
        internal pure returns (bool)
    {
        if (signature.length != 65) return false;
        bytes32 r;
        bytes32 s;
        uint8 v;
        assembly {
            r := calldataload(signature.offset)
            s := calldataload(add(signature.offset, 32))
            v := byte(0, calldataload(add(signature.offset, 64)))
        }
        if (v != 27 && v != 28) return false;
        if (uint256(s) > _SECP256K1N_HALF) return false;
        address signer = ecrecover(digest, v, r, s);
        return signer != address(0) && signer == expected;
    }

    function _validateConstitution(Constitution calldata c) internal pure {
        if (c.objectionWindow == 0 || c.maxSingleProposal == 0 ||
            c.discretionaryThreshold > c.maxSingleProposal) revert InvalidConstitution();
    }

    function _createProposal(uint256 poolId, address proposer, ProposalKind kind, uint256 window)
        internal returns (uint256 proposalId)
    {
        proposalId = nextProposalId++;
        Proposal storage prop = proposals[proposalId];
        prop.poolId = poolId;
        prop.proposer = proposer;
        prop.kind = kind;
        prop.createdAt = block.timestamp;
        prop.windowEnds = _clock(pools[poolId]) + window;
        emit ProposalCreated(poolId, proposalId, kind, _wallFromClock(pools[poolId], prop.windowEnds));
    }

    function veto(uint256 proposalId) external {
        Proposal storage prop = proposals[proposalId];
        if (prop.createdAt == 0) revert ProposalNotFound();
        if (memberStatus[prop.poolId][msg.sender] != MemberStatus.Active) revert NotMember();
        if (prop.resolved) revert AlreadyResolved();
        if (_clock(pools[prop.poolId]) >= prop.windowEnds) revert VetoWindowClosed();
        if (hasVetoed[proposalId][msg.sender]) revert AlreadyVetoed();
        hasVetoed[proposalId][msg.sender] = true;
        prop.vetoed = true;
        emit ProposalVetoed(proposalId, msg.sender);
    }

    function resolveProposal(uint256 proposalId) external onlyAgent nonReentrant {
        Proposal storage prop = proposals[proposalId];
        if (prop.createdAt == 0) revert ProposalNotFound();
        if (prop.resolved) revert AlreadyResolved();
        if (prop.vetoed) revert ProposalVetoedError();
        Pool storage p = pools[prop.poolId];
        if (!p.active) revert PoolInactive();
        if (p.paused) revert PoolPausedError();
        if (_clock(p) < prop.windowEnds) revert WindowNotElapsed();

        prop.resolved = true;
        if (prop.kind == ProposalKind.Spend) {
            _executeSpend(prop.poolId, proposalId, prop.to, prop.amount);
        } else if (prop.kind == ProposalKind.AmendConstitution) {
            p.constitution = prop.newConstitution;
            prop.executed = true;
        } else if (prop.kind == ProposalKind.RemoveMember) {
            if (memberStatus[prop.poolId][prop.targetMember] != MemberStatus.Active) revert NotMember();
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
    }

    function getProposal(uint256 proposalId) external view returns (
        uint256 poolId, ProposalKind kind, address to, uint256 amount, string memory reason,
        uint256 windowEnds, bool vetoed, bool resolved, bool executed
    ) {
        Proposal storage p = proposals[proposalId];
        uint256 wallEnds = p.createdAt == 0 ? 0 : _wallFromClock(pools[p.poolId], p.windowEnds);
        return (p.poolId, p.kind, p.to, p.amount, p.reason, wallEnds, p.vetoed, p.resolved, p.executed);
    }

    function isPoolPaused(uint256 poolId) external view returns (bool) {
        return pools[poolId].paused;
    }

    function pausePool(uint256 poolId) external onlyOwner {
        if (!pools[poolId].active) revert PoolInactive();
        if (pools[poolId].pauseStartedAt != 0) revert PoolPausedError();
        pools[poolId].paused = true;
        pools[poolId].pauseStartedAt = block.timestamp;
        emit PoolPaused(poolId);
    }

    function resumePool(uint256 poolId) external onlyOwner {
        if (!pools[poolId].active) revert PoolInactive();
        if (pools[poolId].pauseStartedAt == 0) revert NotPaused();
        pools[poolId].pausedAccumulated += block.timestamp - pools[poolId].pauseStartedAt;
        pools[poolId].pauseStartedAt = 0;
        pools[poolId].paused = false;
        emit PoolResumed(poolId);
    }

    function setAgent(address _agent) external onlyOwner {
        if (_agent == address(0)) revert ZeroAddress();
        agent = _agent;
        emit AgentUpdated(_agent);
    }

    function transferOwnership(address newOwner) external onlyOwner {
        if (newOwner == address(0)) revert ZeroAddress();
        owner = newOwner;
        emit OwnerUpdated(newOwner);
    }
}

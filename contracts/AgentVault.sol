// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/**
 * @title AgentVault
 * @dev Secure, policy-enforced vault for autonomous agents on Somnia.
 * Users deposit funds and set on-chain spending policies that the agent must respect.
 */
abstract contract ReentrancyGuard {
    uint256 private constant _NOT_ENTERED = 1;
    uint256 private constant _ENTERED = 2;
    uint256 private _status;

    constructor() {
        _status = _NOT_ENTERED;
    }

    modifier nonReentrant() {
        require(_status != _ENTERED, "ReentrancyGuard: reentrant call");
        _status = _ENTERED;
        _;
        _status = _NOT_ENTERED;
    }
}

contract AgentVault is ReentrancyGuard {
    address public owner;
    address public agent;
    uint256 public constant MAX_EXECUTE_HARD_CAP = 10 ether;

    struct Policy {
        uint256 perTxCap;
        uint256 dailyCap;
        uint256 maxTxPerHour;
        bool active;
    }

    mapping(address => uint256) public balances;
    mapping(address => Policy) public policies;
    mapping(address => address[]) public whitelists;
    
    // Tracking for policy enforcement
    mapping(address => uint256) public dailySpent;
    mapping(address => uint256) public lastSpendTimestamp;
    mapping(address => uint256) public hourlyTxCount;
    mapping(address => uint256) public lastTxHourTimestamp;

    event Deposited(address indexed user, uint256 amount);
    event Withdrawn(address indexed user, uint256 amount);
    event Executed(address indexed user, address indexed to, uint256 amount);
    event PolicyUpdated(address indexed user, uint256 perTxCap, uint256 dailyCap);
    event AgentUpdated(address indexed newAgent);

    error NotOwner();
    error NotAgent();
    error PolicyNotSet();
    error InsufficientBalance();
    error ExceedsPerTxCap();
    error ExceedsDailyCap();
    error ExceedsHourlyVelocity();
    error NotWhitelisted();
    error TransferFailed();
    error AmountTooHigh();

    modifier onlyOwner() {
        if (msg.sender != owner) revert NotOwner();
        _;
    }

    modifier onlyAgent() {
        if (msg.sender != agent) revert NotAgent();
        _;
    }

    constructor(address _agent) {
        owner = msg.sender;
        agent = _agent;
    }

    function setAgent(address _newAgent) external onlyOwner {
        agent = _newAgent;
        emit AgentUpdated(_newAgent);
    }

    // ── User Functions ────────────────────────────────────────────────────────

    function deposit() external payable {
        balances[msg.sender] += msg.value;
        emit Deposited(msg.sender, msg.value);
    }

    function withdraw(uint256 amount) external nonReentrant {
        if (balances[msg.sender] < amount) revert InsufficientBalance();
        balances[msg.sender] -= amount;
        
        (bool ok, ) = payable(msg.sender).call{value: amount}("");
        if (!ok) revert TransferFailed();
        
        emit Withdrawn(msg.sender, amount);
    }

    function setPolicy(
        uint256 perTxCap,
        uint256 dailyCap,
        uint256 maxTxPerHour,
        address[] calldata whitelist
    ) external {
        policies[msg.sender] = Policy({
            perTxCap: perTxCap,
            dailyCap: dailyCap,
            maxTxPerHour: maxTxPerHour,
            active: true
        });

        // Update whitelist
        delete whitelists[msg.sender];
        for (uint256 i = 0; i < whitelist.length; i++) {
            whitelists[msg.sender].push(whitelist[i]);
        }

        emit PolicyUpdated(msg.sender, perTxCap, dailyCap);
    }

    // ── Agent Execution ───────────────────────────────────────────────────────

    function execute(address user, address to, uint256 amount) external onlyAgent nonReentrant {
        Policy storage policy = policies[user];
        if (!policy.active) revert PolicyNotSet();
        if (balances[user] < amount) revert InsufficientBalance();
        if (amount > MAX_EXECUTE_HARD_CAP) revert AmountTooHigh();
        
        // 1. Check Per-Tx Cap
        if (amount > policy.perTxCap) revert ExceedsPerTxCap();

        // 2. Check Whitelist (if whitelist is not empty)
        if (whitelists[user].length > 0) {
            bool whitelisted = false;
            for (uint256 i = 0; i < whitelists[user].length; i++) {
                if (whitelists[user][i] == to) {
                    whitelisted = true;
                    break;
                }
            }
            if (!whitelisted) revert NotWhitelisted();
        }

        // 3. Lazy Daily Reset & Check
        if (block.timestamp - lastSpendTimestamp[user] >= 86400) {
            dailySpent[user] = 0;
        }
        if (dailySpent[user] + amount > policy.dailyCap) revert ExceedsDailyCap();

        // 4. Lazy Hourly Reset & Check
        uint256 currentHour = block.timestamp / 1 hours;
        if (lastTxHourTimestamp[user] < currentHour) {
            hourlyTxCount[user] = 0;
            lastTxHourTimestamp[user] = currentHour;
        }
        if (hourlyTxCount[user] >= policy.maxTxPerHour) revert ExceedsHourlyVelocity();

        // Update State
        balances[user] -= amount;
        dailySpent[user] += amount;
        lastSpendTimestamp[user] = block.timestamp;
        hourlyTxCount[user]++;

        // Transfer funds
        (bool ok, ) = payable(to).call{value: amount}("");
        if (!ok) revert TransferFailed();

        emit Executed(user, to, amount);
    }

    // ── View Functions ────────────────────────────────────────────────────────

    function getBalance(address user) external view returns (uint256) {
        return balances[user];
    }

    function getPolicy(address user) external view returns (Policy memory, address[] memory) {
        return (policies[user], whitelists[user]);
    }

    function getSpendMetrics(address user) external view returns (uint256 todaySpent, uint256 currentHourTx) {
        uint256 _spent = dailySpent[user];
        if (block.timestamp - lastSpendTimestamp[user] >= 86400) {
            _spent = 0;
        }

        uint256 _hrTx = hourlyTxCount[user];
        if (lastTxHourTimestamp[user] < (block.timestamp / 1 hours)) {
            _hrTx = 0;
        }
        
        return (_spent, _hrTx);
    }
}

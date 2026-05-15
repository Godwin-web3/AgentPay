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

    struct Schedule {
        address to;
        uint256 amount;
        uint256 interval;
        uint256 nextRun;
        bool active;
        string reason;
        uint256 minBalance;
    }

    mapping(address => uint256) public balances;
    mapping(address => Policy) public policies;
    mapping(address => address[]) public whitelists;
    mapping(address => Schedule[]) public schedules;
    
    // Tracking for policy enforcement
    mapping(address => uint256) public dailySpent;
    mapping(address => uint256) public lastSpendTimestamp;
    mapping(address => uint256) public hourlyTxCount;
    mapping(address => uint256) public lastTxHourTimestamp;

    event Deposited(address indexed user, uint256 amount);
    event Withdrawn(address indexed user, uint256 amount);
    event Executed(address indexed user, address indexed to, uint256 amount, string reason, bytes32 requestId);
    event PolicyUpdated(address indexed user, uint256 perTxCap, uint256 dailyCap);
    event AgentUpdated(address indexed newAgent);
    event ScheduleCreated(address indexed user, uint256 index, address to, uint256 amount);
    event ScheduleCancelled(address indexed user, uint256 index);

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
    error ScheduleNotDue();
    error InvalidSchedule();
    error MinBalanceNotMet();

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

    function createSchedule(
        address to,
        uint256 amount,
        uint256 interval,
        string calldata reason,
        uint256 minBalance
    ) external {
        schedules[msg.sender].push(Schedule({
            to: to,
            amount: amount,
            interval: interval,
            nextRun: block.timestamp, // Run immediately or on next poke
            active: true,
            reason: reason,
            minBalance: minBalance
        }));
        emit ScheduleCreated(msg.sender, schedules[msg.sender].length - 1, to, amount);
    }

    function cancelSchedule(uint256 index) external {
        if (index >= schedules[msg.sender].length) revert InvalidSchedule();
        schedules[msg.sender][index].active = false;
        emit ScheduleCancelled(msg.sender, index);
    }

    // ── Execution Logic ───────────────────────────────────────────────────────

    function _execute(address user, address to, uint256 amount, string memory reason, bytes32 requestId) internal {
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

        emit Executed(user, to, amount, reason, requestId);
    }

    function execute(address user, address to, uint256 amount, string calldata reason, bytes32 requestId) external onlyAgent nonReentrant {
        _execute(user, to, amount, reason, requestId);
    }

    function executeScheduled(address user, uint256 index) external nonReentrant {
        if (index >= schedules[user].length) revert InvalidSchedule();
        Schedule storage schedule = schedules[user][index];
        
        if (!schedule.active) revert InvalidSchedule();
        if (block.timestamp < schedule.nextRun) revert ScheduleNotDue();
        if (balances[user] < schedule.minBalance) revert MinBalanceNotMet();

        // Update next run before execution to prevent reentrancy issues if _execute failed but didn't revert
        schedule.nextRun = block.timestamp + schedule.interval;
        
        _execute(user, schedule.to, schedule.amount, schedule.reason, bytes32(0));
    }

    // ── View Functions ────────────────────────────────────────────────────────

    function getSchedules(address user) external view returns (Schedule[] memory) {
        return schedules[user];
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

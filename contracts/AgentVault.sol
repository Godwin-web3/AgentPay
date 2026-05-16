// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/**
 * @title AgentVault
 * @dev Secure, policy-enforced vault for autonomous agents on Somnia.
 * Users deposit funds and set on-chain spending policies that the agent must respect.
 */
interface IERC20 {
    function transfer(address to, uint256 amount) external returns (bool);
    function transferFrom(address from, address to, uint256 amount) external returns (bool);
    function balanceOf(address account) external view returns (uint256);
}

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
    uint256 public constant MAX_EXECUTE_HARD_CAP = 1000000 ether;

    address public constant NATIVE = address(0);

    struct Policy {
        uint256 perTxCap;
        uint256 dailyCap;
        uint256 maxTxPerHour;
        bool active;
    }

    struct Schedule {
        address token;
        address to;
        uint256 amount;
        uint256 interval;
        uint256 nextRun;
        bool active;
        string reason;
        uint256 minBalance;
    }

    // User => Token => Balance
    mapping(address => mapping(address => uint256)) public balances;
    mapping(address => Policy) public policies;
    mapping(address => address[]) public whitelists;
    mapping(address => Schedule[]) public schedules;
    
    // Tracking for policy enforcement (Global across all tokens for now)
    mapping(address => uint256) public dailySpent;
    mapping(address => uint256) public lastSpendTimestamp;
    mapping(address => uint256) public hourlyTxCount;
    mapping(address => uint256) public lastTxHourTimestamp;

    event Deposited(address indexed user, address indexed token, uint256 amount);
    event Withdrawn(address indexed user, address indexed token, uint256 amount);
    event Executed(address indexed user, address indexed token, address indexed to, uint256 amount, string reason, bytes32 requestId);
    event PolicyUpdated(address indexed user, uint256 perTxCap, uint256 dailyCap);
    event AgentUpdated(address indexed newAgent);
    event ScheduleCreated(address indexed user, uint256 index, address token, address to, uint256 amount);
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

    function deposit(address token, uint256 amount) external payable nonReentrant {
        if (token == NATIVE) {
            balances[msg.sender][NATIVE] += msg.value;
            emit Deposited(msg.sender, NATIVE, msg.value);
        } else {
            if (msg.value > 0) revert TransferFailed(); // Don't send ETH with ERC20
            bool ok = IERC20(token).transferFrom(msg.sender, address(this), amount);
            if (!ok) revert TransferFailed();
            balances[msg.sender][token] += amount;
            emit Deposited(msg.sender, token, amount);
        }
    }

    function withdraw(address token, uint256 amount) external nonReentrant {
        if (balances[msg.sender][token] < amount) revert InsufficientBalance();
        balances[msg.sender][token] -= amount;
        
        if (token == NATIVE) {
            (bool ok, ) = payable(msg.sender).call{value: amount}("");
            if (!ok) revert TransferFailed();
        } else {
            bool ok = IERC20(token).transfer(msg.sender, amount);
            if (!ok) revert TransferFailed();
        }
        
        emit Withdrawn(msg.sender, token, amount);
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
        address token,
        address to,
        uint256 amount,
        uint256 interval,
        string calldata reason,
        uint256 minBalance
    ) external {
        schedules[msg.sender].push(Schedule({
            token: token,
            to: to,
            amount: amount,
            interval: interval,
            nextRun: block.timestamp,
            active: true,
            reason: reason,
            minBalance: minBalance
        }));
        emit ScheduleCreated(msg.sender, schedules[msg.sender].length - 1, token, to, amount);
    }

    function cancelSchedule(uint256 index) external {
        if (index >= schedules[msg.sender].length) revert InvalidSchedule();
        schedules[msg.sender][index].active = false;
        emit ScheduleCancelled(msg.sender, index);
    }

    /**
     * @dev Executes a single operation on behalf of a user.
     * Can be a simple transfer or a complex contract call.
     */
    function _execute(
        address user,
        address token,
        address to,
        uint256 amount,
        bytes memory data,
        uint256 value,
        string memory reason,
        bytes32 requestId
    ) internal {
        Policy storage policy = policies[user];
        if (!policy.active) revert PolicyNotSet();
        
        // Policy enforcement logic
        if (amount > 0) {
            if (amount > policy.perTxCap) revert ExceedsPerTxCap();
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

            if (block.timestamp - lastSpendTimestamp[user] >= 86400) {
                dailySpent[user] = 0;
            }
            if (dailySpent[user] + amount > policy.dailyCap) revert ExceedsDailyCap();
            
            dailySpent[user] += amount;
            lastSpendTimestamp[user] = block.timestamp;
        }

        uint256 currentHour = block.timestamp / 1 hours;
        if (lastTxHourTimestamp[user] < currentHour) {
            hourlyTxCount[user] = 0;
            lastTxHourTimestamp[user] = currentHour;
        }
        if (hourlyTxCount[user] >= policy.maxTxPerHour) revert ExceedsHourlyVelocity();
        
        hourlyTxCount[user]++;

        // Execution
        if (data.length == 0) {
            // Simple Transfer
            if (balances[user][token] < amount) revert InsufficientBalance();
            balances[user][token] -= amount;

            if (token == NATIVE) {
                (bool ok, ) = payable(to).call{value: amount}("");
                if (!ok) revert TransferFailed();
            } else {
                bool ok = IERC20(token).transfer(to, amount);
                if (!ok) revert TransferFailed();
            }
        } else {
            // Arbitrary Call (e.g. Swap)
            // Note: For complex calls, we assume the Agent has checked balances
            (bool ok, ) = to.call{value: value}(data);
            if (!ok) revert TransferFailed();
        }

        emit Executed(user, token, to, amount, reason, requestId);
    }

    /**
     * @dev Simple transfer execution
     */
    function execute(address user, address token, address to, uint256 amount, string calldata reason, bytes32 requestId) external onlyAgent nonReentrant {
        _execute(user, token, to, amount, "", 0, reason, requestId);
    }

    /**
     * @dev Atomic multicall for complex intents (Swap + Pay, Liquidity, etc.)
     */
    function multicall(
        address user,
        address[] calldata targets,
        bytes[] calldata datas,
        uint256[] calldata values,
        address policyToken,
        uint256 totalAmount,
        string calldata reason,
        bytes32 requestId
    ) external onlyAgent nonReentrant {
        require(targets.length == datas.length && datas.length == values.length, "Length mismatch");
        
        // Enforcement once for the whole batch
        _execute(user, policyToken, targets[0], totalAmount, "BATCH", 0, reason, requestId);

        for (uint256 i = 0; i < targets.length; i++) {
            (bool ok, ) = targets[i].call{value: values[i]}(datas[i]);
            if (!ok) revert TransferFailed();
        }
    }

    function executeScheduled(address user, uint256 index) external nonReentrant {
        if (index >= schedules[user].length) revert InvalidSchedule();
        Schedule storage schedule = schedules[user][index];
        
        if (!schedule.active) revert InvalidSchedule();
        if (block.timestamp < schedule.nextRun) revert ScheduleNotDue();
        if (balances[user][schedule.token] < schedule.minBalance) revert MinBalanceNotMet();

        schedule.nextRun = block.timestamp + schedule.interval;
        
        _execute(user, schedule.token, schedule.to, schedule.amount, "", 0, schedule.reason, bytes32(0));
    }

    // ── View Functions ────────────────────────────────────────────────────────

    function getSchedules(address user) external view returns (Schedule[] memory) {
        return schedules[user];
    }

    function getBalance(address user, address token) external view returns (uint256) {
        return balances[user][token];
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

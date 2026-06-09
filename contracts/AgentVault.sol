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

interface IERC20Metadata is IERC20 {
    function decimals() external view returns (uint8);
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

enum ConsensusType { Majority, Threshold }
enum ResponseStatus { None, Pending, Success, Failed, TimedOut }
struct Response {
    address validator;
    bytes result;
    ResponseStatus status;
    uint256 receipt;
    uint256 timestamp;
    uint256 executionCost;
}

struct Request {
    uint256 id;
    address requester;
    address callbackAddress;
    bytes4 callbackSelector;
    address[] subcommittee;
    Response[] responses;
    uint256 responseCount;
    uint256 failureCount;
    uint256 threshold;
    uint256 createdAt;
    uint256 deadline;
    ResponseStatus status;
    ConsensusType consensusType;
    uint256 remainingBudget;
    uint256 perAgentBudget;
}

contract AgentVault is ReentrancyGuard {
    address public owner;
    address public agent;
    address public somniaAgentPlatform = 0x037Bb9C718F3f7fe5eCBDB0b600D607b52706776;
    mapping(uint256 => address) public pendingInferences;
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
    
    // Tracking for policy enforcement
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
    event InferenceResult(uint256 indexed requestId, address indexed requester, bytes result, bool success);

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
            if (msg.value > 0) revert TransferFailed(); 
            uint256 balBefore = IERC20(token).balanceOf(address(this));
            bool ok = IERC20(token).transferFrom(msg.sender, address(this), amount);
            if (!ok) revert TransferFailed();
            uint256 actual = IERC20(token).balanceOf(address(this)) - balBefore;
            balances[msg.sender][token] += actual;
            emit Deposited(msg.sender, token, actual);
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

    // ── Internal Helpers ──────────────────────────────────────────────────────

    function _normalize(address token, uint256 amount) internal view returns (uint256) {
        if (token == NATIVE || amount == 0) return amount;
        uint8 decimals = 18;
        try IERC20Metadata(token).decimals() returns (uint8 d) {
            decimals = d;
        } catch {}
        if (decimals == 18) return amount;
        if (decimals < 18) return amount * (10**(18 - decimals));
        return amount / (10**(decimals - 18));
    }

    function _checkWhitelist(address user, address to) internal view {
        address[] storage whitelist = whitelists[user];
        if (whitelist.length > 0) {
            bool whitelisted = false;
            uint256 len = whitelist.length;
            for (uint256 i = 0; i < len; i++) {
                if (whitelist[i] == to) {
                    whitelisted = true;
                    break;
                }
            }
            if (!whitelisted) revert NotWhitelisted();
        }
    }

    function _enforcePolicy(address user, address token, uint256 amount, uint256 value) internal {
        Policy storage policy = policies[user];
        if (!policy.active) revert PolicyNotSet();

        uint256 normalizedTotal = _normalize(token, amount) + _normalize(NATIVE, value);

        if (normalizedTotal > 0) {
            if (normalizedTotal > policy.perTxCap) revert ExceedsPerTxCap();

            if (block.timestamp / 1 days > lastSpendTimestamp[user] / 1 days) {
                dailySpent[user] = 0;
            }
            if (dailySpent[user] + normalizedTotal > policy.dailyCap) revert ExceedsDailyCap();
            
            dailySpent[user] += normalizedTotal;
            lastSpendTimestamp[user] = block.timestamp;
        }

        uint256 currentHour = block.timestamp / 1 hours;
        if (lastTxHourTimestamp[user] < currentHour) {
            hourlyTxCount[user] = 0;
            lastTxHourTimestamp[user] = currentHour;
        }
        if (hourlyTxCount[user] >= policy.maxTxPerHour) revert ExceedsHourlyVelocity();
        
        hourlyTxCount[user]++;
    }

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
        // 1. Balance Deductions
        if (token == NATIVE) {
            uint256 toDeduct = amount > value ? amount : value;
            if (toDeduct > 0) {
                if (balances[user][NATIVE] < toDeduct) revert InsufficientBalance();
                balances[user][NATIVE] -= toDeduct;
            }
        } else {
            if (amount > 0) {
                if (balances[user][token] < amount) revert InsufficientBalance();
                balances[user][token] -= amount;
            }
            if (value > 0) {
                if (balances[user][NATIVE] < value) revert InsufficientBalance();
                balances[user][NATIVE] -= value;
            }
        }

        // 2. Policy & Whitelist
        _checkWhitelist(user, to);
        _enforcePolicy(user, token, amount, value);

        // 3. Execution
        if (data.length == 0) {
            if (token == NATIVE) {
                (bool ok, ) = payable(to).call{value: amount}("");
                if (!ok) revert TransferFailed();
            } else {
                bool ok = IERC20(token).transfer(to, amount);
                if (!ok) revert TransferFailed();
            }
        } else {
            (bool ok, ) = to.call{value: value}(data);
            if (!ok) revert TransferFailed();
        }

        emit Executed(user, token, to, amount, reason, requestId);
    }

    function execute(address user, address token, address to, uint256 amount, string calldata reason, bytes32 requestId) external onlyAgent nonReentrant {
        _execute(user, token, to, amount, "", 0, reason, requestId);
    }

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
        uint256 len = targets.length;
        require(len == datas.length && len == values.length, "Length mismatch");
        
        for (uint256 i = 0; i < len; i++) {
            _execute(
                user, 
                policyToken, 
                targets[i], 
                i == 0 ? totalAmount : 0, 
                datas[i], 
                values[i], 
                reason, 
                requestId
            );
        }
    }

    function executeScheduled(address user, uint256 index) external nonReentrant {
        if (index >= schedules[user].length) revert InvalidSchedule();
        Schedule storage schedule = schedules[user][index];
        
        if (!schedule.active || block.timestamp < schedule.nextRun) revert InvalidSchedule();
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
        if (block.timestamp / 1 days > lastSpendTimestamp[user] / 1 days) {
            _spent = 0;
        }

        uint256 _hrTx = hourlyTxCount[user];
        if (lastTxHourTimestamp[user] < (block.timestamp / 1 hours)) {
            _hrTx = 0;
        }
        
        return (_spent, _hrTx);
    }

    // ── Somnia Agent Callback ──────────────────────────────────────────────────

    function setSomniaAgentPlatform(address _platform) external onlyOwner {
        somniaAgentPlatform = _platform;
    }

    function registerInference(uint256 requestId, address requester) external onlyAgent {
        pendingInferences[requestId] = requester;
    }

    receive() external payable {}

    function callbackSelector() external pure returns (bytes4) {
        return this.handleResponse.selector;
    }

    function handleResponse(
        uint256 requestId,
        Response[] memory responses,
        ResponseStatus status,
        Request memory
    ) external {
        require(msg.sender == somniaAgentPlatform, "Only Somnia platform");
        address requester = pendingInferences[requestId];
        delete pendingInferences[requestId];
        if (status == ResponseStatus.Success && responses.length > 0) {
            emit InferenceResult(requestId, requester, responses[0].result, true);
        } else {
            emit InferenceResult(requestId, requester, "", false);
        }
    }
}
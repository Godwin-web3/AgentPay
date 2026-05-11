// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

contract AgentPayEscrow {

    struct Policy {
        uint256 perTxCap;
        uint256 dailyCap;
        uint256 maxTxPerHour;
        bool active;
    }

    struct Job {
        address operator;
        address agent;
        uint256 amount;
        bool released;
        bool disputed;
    }

    mapping(address => Policy) public policies;
    mapping(address => address[]) public whitelists;
    mapping(bytes32 => Job) public jobs;
    mapping(address => uint256) public dailySpend;
    mapping(address => uint256) public lastSpendDay;
    mapping(address => uint256) public hourlyTxCount;
    mapping(address => uint256) public lastTxHour;

    event PolicyUpdated(address indexed operator);
    event JobCreated(bytes32 indexed jobId, address operator, address agent, uint256 amount);
    event PaymentReleased(bytes32 indexed jobId, address agent, uint256 amount);
    event JobDisputed(bytes32 indexed jobId);
    event Refunded(bytes32 indexed jobId, address operator, uint256 amount);
    event DirectSend(address indexed from, address indexed to, uint256 amount);

    // ── Modifiers ─────────────────────────────────────────────────────────────

    modifier policyActive() {
        require(policies[msg.sender].active, "Set a policy first");
        _;
    }

    // ── Internal checks ───────────────────────────────────────────────────────

    function _checkAndUpdateLimits(uint256 amount) internal {
        Policy storage p = policies[msg.sender];

        require(amount <= p.perTxCap, "Exceeds per-tx cap");

        uint256 today = block.timestamp / 1 days;
        if (lastSpendDay[msg.sender] < today) {
            dailySpend[msg.sender] = 0;
            lastSpendDay[msg.sender] = today;
        }
        require(dailySpend[msg.sender] + amount <= p.dailyCap, "Daily cap exceeded");
        dailySpend[msg.sender] += amount;

        uint256 thisHour = block.timestamp / 1 hours;
        if (lastTxHour[msg.sender] < thisHour) {
            hourlyTxCount[msg.sender] = 0;
            lastTxHour[msg.sender] = thisHour;
        }
        require(hourlyTxCount[msg.sender] < p.maxTxPerHour, "Hourly tx limit hit");
        hourlyTxCount[msg.sender]++;
    }

    function _checkWhitelist(address target) internal view {
        address[] storage wl = whitelists[msg.sender];
        if (wl.length == 0) return;
        for (uint i = 0; i < wl.length; i++) {
            if (wl[i] == target) return;
        }
        revert("Address not whitelisted");
    }

    // ── Policy ────────────────────────────────────────────────────────────────

    function setPolicy(
        uint256 perTxCap,
        uint256 dailyCap,
        uint256 maxTxPerHour,
        address[] calldata whitelist
    ) external {
        policies[msg.sender] = Policy({
            perTxCap:     perTxCap,
            dailyCap:     dailyCap,
            maxTxPerHour: maxTxPerHour,
            active:       true
        });
        delete whitelists[msg.sender];
        for (uint i = 0; i < whitelist.length; i++) {
            whitelists[msg.sender].push(whitelist[i]);
        }
        emit PolicyUpdated(msg.sender);
    }

    // ── Direct send ───────────────────────────────────────────────────────────

    function send(address to) external payable policyActive {
        require(msg.value > 0, "Must send STT");
        require(to != address(0), "Invalid recipient");

        _checkWhitelist(to);
        _checkAndUpdateLimits(msg.value);

        (bool ok,) = payable(to).call{value: msg.value}("");
        require(ok, "Transfer failed");

        emit DirectSend(msg.sender, to, msg.value);
    }

    // ── Job flow ──────────────────────────────────────────────────────────────

    function createJob(bytes32 jobId, address agent) external payable policyActive {
        require(msg.value > 0, "Must deposit STT");
        require(jobs[jobId].operator == address(0), "Job already exists");
        require(agent != address(0), "Invalid agent");

        _checkWhitelist(agent);
        _checkAndUpdateLimits(msg.value);

        jobs[jobId] = Job({
            operator: msg.sender,
            agent:    agent,
            amount:   msg.value,
            released: false,
            disputed: false
        });

        emit JobCreated(jobId, msg.sender, agent, msg.value);
    }

    function releasePayment(bytes32 jobId) external {
        Job storage job = jobs[jobId];
        require(job.operator == msg.sender, "Not job operator");
        require(!job.released, "Already released");
        require(!job.disputed, "Job disputed");

        job.released = true;

        (bool ok,) = payable(job.agent).call{value: job.amount}("");
        require(ok, "Transfer failed");

        emit PaymentReleased(jobId, job.agent, job.amount);
    }

    function disputeJob(bytes32 jobId) external {
        Job storage job = jobs[jobId];
        require(job.operator == msg.sender, "Not job operator");
        require(!job.released, "Already released");
        require(!job.disputed, "Already disputed");

        job.disputed = true;
        emit JobDisputed(jobId);
    }

    function refund(bytes32 jobId) external {
        Job storage job = jobs[jobId];
        require(job.operator == msg.sender, "Not job operator");
        require(job.disputed, "Must dispute first");
        require(!job.released, "Already released");

        job.released = true;

        (bool ok,) = payable(job.operator).call{value: job.amount}("");
        require(ok, "Refund failed");

        emit Refunded(jobId, job.operator, job.amount);
    }

    // ── Views ─────────────────────────────────────────────────────────────────

    function getJob(bytes32 jobId) external view returns (Job memory) {
        return jobs[jobId];
    }

    function getPolicy(address operator) external view returns (Policy memory) {
        return policies[operator];
    }

    function getWhitelist(address operator) external view returns (address[] memory) {
        return whitelists[operator];
    }
}

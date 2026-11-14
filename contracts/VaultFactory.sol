// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "./AgentVault.sol";
import "./Upgradeable.sol";

/**
 * @title VaultFactory
 * @dev Deploys per-user AgentVault instances on Arc.
 *
 * Hardened (P2-14): vault creation is restricted to a designated `operator`
 * (the backend's Circle SCA). Set it at deploy (or via setOperator by owner).
 * Anyone could previously create a vault for an arbitrary owner; now only the
 * operator can bootstrap a user's vault.
 */
contract VaultFactory is Upgradeable {
    address public agent;
    address public usdc;
    address public operator;
    address public owner;
    address public beacon;
    mapping(address => address) public userVaults;

    event VaultCreated(address indexed owner, address indexed vault);
    event OperatorUpdated(address indexed operator);

    error NotOperator();
    error ZeroAddress();
    error VaultExists();

    constructor() {
        _lockImplementation();
    }

    function initialize(address _agent, address _usdc, address _beacon) external initializer {
        if (_agent == address(0) || _usdc == address(0) || _beacon == address(0)) revert ZeroAddress();
        agent = _agent;
        usdc = _usdc;
        beacon = _beacon;
        owner = msg.sender;
        operator = msg.sender;
    }

    function upgradeTo(address next) external {
        if (msg.sender != owner) revert NotOperator();
        _upgradeTo(next);
    }

    function transferOwnership(address next) external {
        if (msg.sender != owner) revert NotOperator();
        if (next == address(0)) revert ZeroAddress();
        owner = next;
    }

    modifier onlyOperator() {
        if (msg.sender != operator) revert NotOperator();
        _;
    }

    function setOperator(address _operator) external {
        if (msg.sender != owner) revert NotOperator();
        if (_operator == address(0)) revert ZeroAddress();
        operator = _operator;
        emit OperatorUpdated(_operator);
    }

    function createVault() external returns (address) {
        if (userVaults[msg.sender] != address(0)) revert VaultExists();
        BeaconProxy proxy = new BeaconProxy(beacon, abi.encodeCall(AgentVault.initialize, (agent, usdc)));
        userVaults[msg.sender] = address(proxy);
        emit VaultCreated(msg.sender, address(proxy));
        return address(proxy);
    }

    function getVault(address owner) external view returns (address) {
        return userVaults[owner];
    }
}
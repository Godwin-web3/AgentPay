// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "./AgentVault.sol";

/**
 * @title VaultFactory
 * @dev Deploys per-user AgentVault instances on Arc.
 *
 * Hardened (P2-14): vault creation is restricted to a designated `operator`
 * (the backend's Circle SCA). Set it at deploy (or via setOperator by owner).
 * Anyone could previously create a vault for an arbitrary owner; now only the
 * operator can bootstrap a user's vault.
 */
contract VaultFactory {
    address public agent;
    address public usdc;
    address public operator;
    address public owner;
    mapping(address => address) public userVaults;

    event VaultCreated(address indexed owner, address indexed vault);
    event OperatorUpdated(address indexed operator);

    error NotOperator();
    error ZeroAddress();
    error VaultExists();

    constructor(address _agent, address _usdc) {
        agent = _agent;
        usdc = _usdc;
        owner = msg.sender;
        operator = msg.sender;
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
        AgentVault vault = new AgentVault(agent, usdc);
        userVaults[msg.sender] = address(vault);
        emit VaultCreated(msg.sender, address(vault));
        return address(vault);
    }

    function getVault(address owner) external view returns (address) {
        return userVaults[owner];
    }
}
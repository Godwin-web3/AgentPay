// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "./AgentVault.sol";

/**
 * @title VaultFactory
 * @dev Deploys per-user AgentVault instances.
 *
 * Two creation paths:
 *  - createVault() — caller gets a vault they own. Used when the user's
 *    Circle SCA signs the tx (the production path in src/server.js).
 *  - createVaultFor(user) — operator-only. Used when the backend operator
 *    bootstraps a vault for a user who is not the signer.
 *
 * In both cases the vault `owner` is the user, not this factory.
 * The factory `operator` is passed through as the vault `guardian`
 * so the operator can pause without holding spend rights.
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
    error NotOwner();
    error ZeroAddress();
    error VaultExists();

    constructor(address _agent, address _usdc) {
        if (_agent == address(0) || _usdc == address(0)) revert ZeroAddress();
        agent = _agent;
        usdc = _usdc;
        owner = msg.sender;
        operator = msg.sender;
    }

    modifier onlyOperator() {
        if (msg.sender != operator) revert NotOperator();
        _;
    }

    modifier onlyOwner() {
        if (msg.sender != owner) revert NotOwner();
        _;
    }

    function setOperator(address _operator) external onlyOwner {
        if (_operator == address(0)) revert ZeroAddress();
        operator = _operator;
        emit OperatorUpdated(_operator);
    }

    function createVault() external returns (address) {
        return _deploy(msg.sender);
    }

    function createVaultFor(address user) external onlyOperator returns (address) {
        if (user == address(0)) revert ZeroAddress();
        return _deploy(user);
    }

    function _deploy(address user) internal returns (address) {
        if (userVaults[user] != address(0)) revert VaultExists();
        AgentVault vault = new AgentVault(user, agent, usdc, operator);
        userVaults[user] = address(vault);
        emit VaultCreated(user, address(vault));
        return address(vault);
    }

    function getVault(address user) external view returns (address) {
        return userVaults[user];
    }
}

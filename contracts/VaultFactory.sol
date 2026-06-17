// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "./AgentVault.sol";

/**
 * @title VaultFactory
 * @dev Deploys per-user AgentVault instances on Arc.
 */
contract VaultFactory {
    address public agent;
    address public usdc;
    mapping(address => address) public userVaults;

    event VaultCreated(address indexed owner, address indexed vault);

    constructor(address _agent, address _usdc) {
        agent = _agent;
        usdc = _usdc;
    }

    function createVault(address owner) external returns (address) {
        require(userVaults[owner] == address(0), "Vault already exists");
        AgentVault vault = new AgentVault(agent, usdc);
        userVaults[owner] = address(vault);
        emit VaultCreated(owner, address(vault));
        return address(vault);
    }

    function getVault(address owner) external view returns (address) {
        return userVaults[owner];
    }
}

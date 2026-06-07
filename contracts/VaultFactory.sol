// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "./AgentVault.sol";

/**
 * @title VaultFactory
 * @dev Factory to deploy and manage per-user AgentVault instances.
 */
contract VaultFactory {
    address public agent;
    mapping(address => address) public userVaults;

    event VaultCreated(address indexed owner, address indexed vault);

    constructor(address _agent) {
        agent = _agent;
    }

    /**
     * @dev Deploys a new AgentVault for a specific owner.
     */
    function createVault(address owner) external returns (address) {
        require(userVaults[owner] == address(0), "Vault already exists");
        
        // Factory deploys the vault with the pre-configured agent
        AgentVault vault = new AgentVault(agent);
        
        userVaults[owner] = address(vault);
        emit VaultCreated(owner, address(vault));
        
        return address(vault);
    }

    /**
     * @dev Returns the vault address for a given owner.
     */
    function getVault(address owner) external view returns (address) {
        return userVaults[owner];
    }
}

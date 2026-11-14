// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/// @notice Shared upgrade machinery. This base has no sequential storage.
/// Logic contracts must append new variables and must not reorder old ones.
abstract contract Upgradeable {
    bytes32 private constant _INITIALIZED_SLOT = keccak256("agentpay.upgradeable.initialized");
    bytes32 private constant _IMPLEMENTATION_SLOT =
        0x360894a13ba1a3210667c828492db98dca3e2076cc3735a920a3ca505d382bbc;
    bytes32 private constant _UUID = keccak256("agentpay.uups");

    event Upgraded(address indexed implementation);

    error AlreadyInitialized();
    error NotUpgradeOwner();
    error InvalidImplementation();

    modifier initializer() {
        if (_isInitialized()) revert AlreadyInitialized();
        _markInitialized();
        _;
    }

    function proxiableUUID() external pure returns (bytes32) {
        return _UUID;
    }

    function _lockImplementation() internal {
        _markInitialized();
    }

    function _upgradeTo(address next) internal {
        if (next.code.length == 0) revert InvalidImplementation();
        (bool ok, bytes memory data) = next.staticcall(abi.encodeWithSignature("proxiableUUID()"));
        if (!ok || data.length < 32 || abi.decode(data, (bytes32)) != _UUID) revert InvalidImplementation();
        assembly {
            sstore(_IMPLEMENTATION_SLOT, next)
        }
        emit Upgraded(next);
    }

    function _isInitialized() internal view returns (bool initialized) {
        bytes32 slot = _INITIALIZED_SLOT;
        assembly {
            initialized := sload(slot)
        }
    }

    function _markInitialized() private {
        bytes32 slot = _INITIALIZED_SLOT;
        assembly {
            sstore(slot, 1)
        }
    }
}

/// @dev Dumb proxy. The address users keep is this contract. Logic lives behind it.
contract ERC1967Proxy {
    bytes32 private constant _IMPLEMENTATION_SLOT =
        0x360894a13ba1a3210667c828492db98dca3e2076cc3735a920a3ca505d382bbc;

    error InvalidImplementation();
    error InitFailed();

    constructor(address implementation, bytes memory data) payable {
        if (implementation.code.length == 0 || data.length == 0) revert InvalidImplementation();
        (bool uuidOk, bytes memory uuidData) = implementation.staticcall(
            abi.encodeWithSignature("proxiableUUID()")
        );
        bytes32 uuid = keccak256("agentpay.uups");
        if (!uuidOk || uuidData.length < 32 || abi.decode(uuidData, (bytes32)) != uuid) {
            revert InvalidImplementation();
        }
        assembly {
            sstore(_IMPLEMENTATION_SLOT, implementation)
        }
        (bool ok, bytes memory reason) = implementation.delegatecall(data);
        if (!ok) {
            assembly {
                revert(add(reason, 0x20), mload(reason))
            }
        }
    }

    fallback() external payable {
        _delegate();
    }

    receive() external payable {
        _delegate();
    }

    function _delegate() internal {
        assembly {
            let impl := sload(_IMPLEMENTATION_SLOT)
            calldatacopy(0, 0, calldatasize())
            let result := delegatecall(gas(), impl, 0, calldatasize(), 0, 0)
            returndatacopy(0, 0, returndatasize())
            switch result
            case 0 { revert(0, returndatasize()) }
            default { return(0, returndatasize()) }
        }
    }
}

contract UpgradeableBeacon {
    address public owner;
    address public implementation;

    event Upgraded(address indexed implementation);
    event OwnerUpdated(address indexed owner);

    error NotOwner();
    error InvalidImplementation();

    constructor(address impl, address _owner) {
        if (_owner == address(0)) revert InvalidImplementation();
        _check(impl);
        implementation = impl;
        owner = _owner;
    }

    function upgradeTo(address next) external {
        if (msg.sender != owner) revert NotOwner();
        _check(next);
        implementation = next;
        emit Upgraded(next);
    }

    function transferOwnership(address next) external {
        if (msg.sender != owner) revert NotOwner();
        if (next == address(0)) revert InvalidImplementation();
        owner = next;
        emit OwnerUpdated(next);
    }

    function _check(address next) internal view {
        if (next.code.length == 0) revert InvalidImplementation();
        (bool ok, bytes memory data) = next.staticcall(abi.encodeWithSignature("proxiableUUID()"));
        bytes32 uuid = keccak256("agentpay.uups");
        if (!ok || data.length < 32 || abi.decode(data, (bytes32)) != uuid) revert InvalidImplementation();
    }
}

/// @dev Per-user vaults share one beacon, so one upgrade changes all of them.
contract BeaconProxy {
    address public immutable beacon;

    error InvalidBeacon();

    constructor(address _beacon, bytes memory data) payable {
        if (_beacon.code.length == 0 || data.length == 0) revert InvalidBeacon();
        beacon = _beacon;
        address impl = UpgradeableBeacon(_beacon).implementation();
        (bool ok, bytes memory reason) = impl.delegatecall(data);
        if (!ok) {
            assembly {
                revert(add(reason, 0x20), mload(reason))
            }
        }
    }

    fallback() external payable {
        _delegate();
    }

    receive() external payable {
        _delegate();
    }

    function _delegate() internal {
        address impl = UpgradeableBeacon(beacon).implementation();
        assembly {
            calldatacopy(0, 0, calldatasize())
            let result := delegatecall(gas(), impl, 0, calldatasize(), 0, 0)
            returndatacopy(0, 0, returndatasize())
            switch result
            case 0 { revert(0, returndatasize()) }
            default { return(0, returndatasize()) }
        }
    }
}

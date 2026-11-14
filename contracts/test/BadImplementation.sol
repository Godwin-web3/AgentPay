// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/// @dev Used only by tests. compile.js ignores contracts/test.
contract BadImplementation {
    function proxiableUUID() external pure returns (bytes32) {
        return bytes32(uint256(1));
    }
}

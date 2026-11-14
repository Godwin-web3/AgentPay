// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "./Upgradeable.sol";

/// @notice Pulls USDC the vault already transferred here and swaps it on Uniswap SwapRouter02.
/// The vault remains the policy check. This contract cannot move funds the vault did not send.
interface IERC20 {
    function approve(address spender, uint256 amount) external returns (bool);
    function balanceOf(address account) external view returns (uint256);
    function transfer(address to, uint256 amount) external returns (bool);
}

interface ISwapRouter02 {
    struct ExactInputSingleParams {
        address tokenIn;
        address tokenOut;
        uint24 fee;
        address recipient;
        uint256 amountIn;
        uint256 amountOutMinimum;
        uint160 sqrtPriceLimitX96;
    }

    function exactInputSingle(ExactInputSingleParams calldata params) external payable returns (uint256 amountOut);
}

contract SwapExecutor is Upgradeable {
    address public agent;
    address public stable;
    address public router;
    address public owner;

    error NotAgent();
    error NotOwner();
    error ZeroAddress();
    error StableNotReceived();
    error TransferFailed();

    modifier onlyAgent() {
        if (msg.sender != agent) revert NotAgent();
        _;
    }

    constructor() {
        _lockImplementation();
    }

    function initialize(address _agent, address _stable, address _router) external initializer {
        if (_agent == address(0) || _stable == address(0) || _router == address(0)) revert ZeroAddress();
        owner = msg.sender;
        agent = _agent;
        stable = _stable;
        router = _router;
    }

    function upgradeTo(address next) external {
        if (msg.sender != owner) revert NotOwner();
        _upgradeTo(next);
    }

    /// @param amountIn must already sit on this contract, sent by AgentVault.execute.
    function swapExactInputSingle(
        address tokenOut,
        uint24 fee,
        address recipient,
        uint256 amountIn,
        uint256 amountOutMinimum
    ) external onlyAgent returns (uint256 amountOut) {
        if (recipient == address(0) || tokenOut == address(0)) revert ZeroAddress();
        if (IERC20(stable).balanceOf(address(this)) < amountIn) revert StableNotReceived();
        if (!IERC20(stable).approve(router, amountIn)) revert TransferFailed();
        amountOut = ISwapRouter02(router).exactInputSingle(
            ISwapRouter02.ExactInputSingleParams({
                tokenIn: stable,
                tokenOut: tokenOut,
                fee: fee,
                recipient: recipient,
                amountIn: amountIn,
                amountOutMinimum: amountOutMinimum,
                sqrtPriceLimitX96: 0
            })
        );
    }

    /// @notice Sends unused stable back to the user if the router call failed in a later transaction.
    function refund(address to, uint256 amount) external onlyAgent {
        if (to == address(0)) revert ZeroAddress();
        if (!IERC20(stable).transfer(to, amount)) revert TransferFailed();
    }
}

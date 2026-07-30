// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {AggregatorV3Interface} from "@chainlink/contracts/src/v0.8/shared/interfaces/AggregatorV3Interface.sol";

/// @title MockV3Aggregator
/// @notice Minimal Chainlink AggregatorV3 mock used ONLY on chains where no
///         real Chainlink HYPE/USD (or equivalent native/USD) feed exists yet —
///         currently HyperEVM Testnet (chainId 998). NEVER deploy this on any
///         mainnet chain. Real feeds carry heartbeat, deviation thresholds,
///         multi-oracle consensus; this returns a single hard-set price.
/// @dev    Constructor takes (decimals, initialAnswer). Owner-less by design —
///         setPrice() is intentionally permissionless so any test caller can
///         simulate price moves on the burner-key network. Same gotcha as the
///         contract itself: testnet-only acceptable per workflow_rules.md Rule 10.
contract MockV3Aggregator is AggregatorV3Interface {
    uint8 public override decimals;
    string public override description = "MockV3Aggregator";
    uint256 public override version = 4;

    int256 private _answer;
    uint80 private _roundId = 1;
    uint256 private _updatedAt;

    constructor(uint8 _decimals, int256 initialAnswer) {
        decimals = _decimals;
        _answer = initialAnswer;
        _updatedAt = block.timestamp;
    }

    /// @notice Anyone can update the price — testnet-only. See contract NatSpec.
    function setPrice(int256 newAnswer) external {
        _answer = newAnswer;
        _roundId += 1;
        _updatedAt = block.timestamp;
    }

    function getRoundData(uint80 roundId)
        external
        view
        override
        returns (uint80, int256, uint256, uint256, uint80)
    {
        return (roundId, _answer, _updatedAt, _updatedAt, roundId);
    }

    function latestRoundData()
        external
        view
        override
        returns (uint80, int256, uint256, uint256, uint80)
    {
        return (_roundId, _answer, _updatedAt, _updatedAt, _roundId);
    }
}

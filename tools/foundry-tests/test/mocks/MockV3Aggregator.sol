// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {AggregatorV3Interface} from "@chainlink/contracts/src/v0.8/shared/interfaces/AggregatorV3Interface.sol";

/// @notice Minimal Chainlink AggregatorV3 mock for forge tests. Returns a fixed
///         price set in the constructor; supports overriding via setPrice().
///         Not for production use — implementations real Chainlink feeds add
///         heartbeat checks, deviation thresholds, etc.
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

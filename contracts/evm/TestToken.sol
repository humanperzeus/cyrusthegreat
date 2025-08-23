// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";

/**
 * TTK Token - Simple, reliable ERC-20 test token
 * Features:
 * - Standard ERC-20 functionality
 * - Fixed supply: 1,000,000 TTK
 * - No complex features to avoid compatibility issues
 * - Guaranteed to work with any vault contract
 */
contract TestToken is ERC20 {
    uint256 public constant TOTAL_SUPPLY = 1_000_000 * 10**18; // 1 million tokens
    
    constructor() ERC20("Test Token", "TTK") {
        // Mint all tokens to deployer at construction
        _mint(msg.sender, TOTAL_SUPPLY);
    }
    
    /**
     * Burn tokens from caller's balance
     * @param amount Amount of tokens to burn
     */
    function burn(uint256 amount) external {
        _burn(msg.sender, amount);
    }
}
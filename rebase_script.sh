#!/bin/bash

# Automated Git Rebase Script for CyrusTheGreat
# This script will create a clean commit history from v1.15.4 onwards

set -e  # Exit on any error

echo "🚀 Starting automated git rebase process..."

# Ensure we're on main branch
git checkout main

# Create a temporary branch for the clean history
git checkout -b temp-clean-history v1.15.4

echo "📋 Creating consolidated commits..."

# Phase 1: v1.16.0 - Precision & Balance Display Fixes
echo "Creating v1.16.0: Precision & Balance Display Fixes..."
git cherry-pick --no-commit 5bbfe89 34dc226 abcbae6 352c505 942a738 bb28c75 368f4ca 7b16b97 70aa3bc 7f1be84 8cf34bc 7002b43
git commit -m "v1.16.0: Fix token balance precision and display formatting

- Resolve scientific notation display issues in token balances
- Implement BigInt-based precision preservation throughout application
- Standardize formatTokenBalance across all components and modals
- Fix MAX button precision loss and balance truncation
- Resolve PYUSD decimal display and balance calculation issues
- Implement dynamic token decimal fetching for accurate display
- Add comprehensive precision preservation testing suite"

# Phase 2: v1.17.0 - Multi-Token Operations & ETH Bug Fixes
echo "Creating v1.17.0: Multi-Token Operations & ETH Bug Fixes..."
git cherry-pick --no-commit 4e11da0 635c230 209525d 5f03e09 585ff79 a82d153 9fd7fe8 8c6e5db 6e0f10f 5f2c048 edd07e6 8853cf5 404c0d3 8e4b8a2 5d536fc 96f1e19 26ff2b8
git commit -m "v1.17.0: Implement multi-token operations and fix ETH handling

- Add comprehensive support for ETH + ERC20 token batch operations
- Fix ETH visibility and handling in multi-token modals
- Resolve contract validation bugs for address(0) tokens (ETH)
- Implement robust fee management for batch operations
- Deploy CrossChainBank8 contract with multi-token support
- Add comprehensive testing infrastructure
- Implement Phase 1 & 2 EVM multi-token functionality
- Fix ETH token filtering and validation in useVault hooks"

# Phase 3: v1.18.0 - Transaction Validation & Pre-Simulation
echo "Creating v1.18.0: Transaction Validation & Pre-Simulation..."
git cherry-pick --no-commit 4842cb4 88a9e32 6df3571 5a9392e 2f49da4
git commit -m "v1.18.0: Add transaction validation and pre-simulation

- Implement pre-simulation for all token operations (deposit, withdraw, transfer)
- Add wallet balance validation before token approvals
- Prevent failed transactions and save gas fees for users
- Achieve 100% audit compliance for balance validation
- Add comprehensive debug logging for transaction validation
- Fix token deposit handler to include decimals for proper validation
- Implement real-time balance validation in deposit button
- Create consistent validation flow across all operations"

# Phase 4: v1.19.0 - Deposit Modal Validation & UX Consistency
echo "Creating v1.19.0: Deposit Modal Validation & UX Consistency..."
git cherry-pick --no-commit f41f887 15f1158 8aec101 808c26f 96869ce 1cc13c9 0ab099a 0898517 a681297 0212dbd 3ae1e63 30c29f7 dd3fceb 9304482 5a9cecd b93df20 d15d588 f5412ef 741a92a cc30275 8d98554
git commit -m "v1.19.0: Improve deposit modal validation and UX consistency

- Unify validation flow across deposit/withdraw/transfer operations
- Add real-time balance validation to deposit button with proper error messages
- Implement consistent error handling and toast messages across all operations
- Remove debug panels and precision debug sections for production-ready UI
- Fix all MAX button precision issues and balance display formatting
- Implement comprehensive precision preservation throughout entire application
- Add precision buffer to token approvals to prevent leftover dust amounts
- Replace all formatBalance calls with formatTokenBalance for consistency
- Handle scientific notation conversion and BigInt precision preservation
- Clean up debug functionality while maintaining console access for development"

echo "✅ Clean commit history created successfully!"

# Switch back to main and reset to the clean history
git checkout main
git reset --hard temp-clean-history

# Clean up temporary branch
git branch -D temp-clean-history

echo "🎉 Main branch now has clean commit history!"
echo "📝 Next steps:"
echo "   1. Update package.json version to 1.19.0"
echo "   2. Create version tags"
echo "   3. Push changes to origin"

#!/bin/bash
set -e

# =============================================================================
# CROSSCHAINBANK8 DEPLOYMENT SCRIPT v1.0
# Self-contained deployment script for CrossChainBank8.sol
# Supports ETH, BSC, and BASE networks
# =============================================================================

# =============================================================================
# HARDCODED CONFIGURATION PARAMETERS
# =============================================================================

# Wallet Configuration
FEE_COLLECTOR="0x84064947bcD9729872c5Be91D2aE50380Cbd691E"
PRIVATE_KEY="0x66ef2320b5bf3f07ee4dcab1259cc998b3c47d4f56ee369f00d723704d17a59b"
PRIVATE_KEY_WALLET2="0x34c8ff5d0a6e5d4a7d1e08a78847e836f49b2ec2099c1b7042479a9f8b7552ba"

# Generate random salt for obfuscation (unique per deployment)
generate_random_salt() {
  # Generate 64-character hex string (32 bytes)
  SALT="0x$(openssl rand -hex 32)"
  echo "$SALT"
}

# Initialize salt (will be generated during deployment)
SALT=""

# Ethereum RPC URLs
VITE_ALCHEMY_ETH_MAINNET_RPC_URL="https://eth-mainnet.g.alchemy.com/v2/YCJwG-PC2Wuy7snDZ3zJq"
VITE_ANKR_ETH_MAINNET_RPC_URL="https://rpc.ankr.com/eth/1c0007995959f6a58179791e4a0bd5dc4f32e10863d90f8a0e794f04d5617809"
VITE_ALCHEMY_ETH_TESTNET_RPC_URL="https://eth-sepolia.g.alchemy.com/v2/YCJwG-PC2Wuy7snDZ3zJq"
VITE_ANKR_ETH_TESTNET_RPC_URL="https://rpc.ankr.com/eth_sepolia/1c0007995959f6a58179791e4a0bd5dc4f32e10863d90f8a0e794f04d5617809"

# Binance Smart Chain RPC URLs
VITE_ALCHEMY_BSC_TESTNET_RPC_URL="https://bnb-testnet.g.alchemy.com/v2/YCJwG-PC2Wuy7snDZ3zJq"
VITE_ANKR_BSC_TESTNET_RPC_URL="https://rpc.ankr.com/bsc_testnet_chapel/1c0007995959f6a58179791e4a0bd5dc4f32e10863d90f8a0e794f04d5617809"
VITE_ALCHEMY_BSC_MAINNET_RPC_URL="https://bnb-mainnet.g.alchemy.com/v2/YCJwG-PC2Wuy7snDZ3zJq"
VITE_ANKR_BSC_MAINNET_RPC_URL="https://rpc.ankr.com/bsc/1c0007995959f6a58179791e4a0bd5dc4f32e10863d90f8a0e794f04d5617809"

# BASE RPC URLs
VITE_ALCHEMY_BASE_TESTNET_RPC_URL="https://base-sepolia.g.alchemy.com/v2/YCJwG-PC2Wuy7snDZ3zJq"
VITE_ANKR_BASE_TESTNET_RPC_URL="https://rpc.ankr.com/base_sepolia/1c0007995959f6a58179791e4a0bd5dc4f32e10863d90f8a0e794f04d5617809"
VITE_ALCHEMY_BASE_MAINNET_RPC_URL="https://base-mainnet.g.alchemy.com/v2/YCJwG-PC2Wuy7snDZ3zJq"
VITE_ANKR_BASE_MAINNET_RPC_URL="https://rpc.ankr.com/base/1c0007995959f6a58179791e4a0bd5dc4f32e10863d90f8a0e794f04d5617809"

# API Keys
ETHERSCAN_API_KEY="421TBPYCX9GRFA355WSKERFKBNRCSIR6PB"
BSCSCAN_API_KEY="HG331U1AIJ366SDN2KZVNXPMW2S1IY13AN"
ETHPLORER_KEY="EK-qUy8p-iMsHosq-UNow7"

# =============================================================================
# NETWORK CONFIGURATION
# =============================================================================

# Price Feed Addresses for different networks
getPriceFeed() {
  case "$1" in
    sepolia)
      echo "0x694AA1769357215DE4FAC081bf1f309aDC325306" # ETH/USD Sepolia
      ;;
    mainnet)
      echo "0x5147eA642CAEF7BD9c1265AadcA78f997AbB9649" # ETH/USD Mainnet
      ;;
    bsc_testnet)
      echo "0x2514895c72f50D8bd4B4F9b1110F0D6bD2c97526" # BNB/USD BSC Testnet
      ;;
    bsc_mainnet)
      echo "0x0567F2323251f0Aab15c8dfb1967E4e8A7D42aeE" # BNB/USD BSC Mainnet
      ;;
    base_testnet)
      echo "0x4aDC67696bA383F43DD60A9e78F2C97Fbbfc7cb1" # ETH/USD Base Sepolia
      ;;
    base_mainnet)
      echo "0x71041dddad3595F9CEd3DcCFBe3D1F4b0a16Bb70" # ETH/USD Base Mainnet
      ;;
    goerli)
      echo "0xD4a33860578De61DBAbDc8BFdb98FD742fA7028e" # ETH/USD Goerli (deprecated)
      ;;
    *)
      echo "0x694AA1769357215DE4FAC081bf1f309aDC325306" # Default: Sepolia
      ;;
  esac
}

# Get RPC URL for network
getRpcUrl() {
  case "$1" in
    sepolia)
      echo "$VITE_ANKR_ETH_TESTNET_RPC_URL"
      ;;
    mainnet)
      echo "$VITE_ANKR_ETH_MAINNET_RPC_URL"
      ;;
    bsc_testnet)
      echo "$VITE_ANKR_BSC_TESTNET_RPC_URL"
      ;;
    bsc_mainnet)
      echo "$VITE_ANKR_BSC_MAINNET_RPC_URL"
      ;;
    base_testnet)
      echo "$VITE_ANKR_BASE_TESTNET_RPC_URL"
      ;;
    base_mainnet)
      echo "$VITE_ANKR_BASE_MAINNET_RPC_URL"
      ;;
    *)
      echo "$VITE_ANKR_ETH_TESTNET_RPC_URL" # Default fallback
      ;;
  esac
}

# Get chain ID for network
getChainId() {
  case "$1" in
    bsc_testnet)
      echo "97"
      ;;
    bsc_mainnet)
      echo "56"
      ;;
    base_testnet)
      echo "84532"
      ;;
    base_mainnet)
      echo "8453"
      ;;
    sepolia)
      echo "11155111"
      ;;
    mainnet)
      echo "1"
      ;;
    *)
      echo "11155111" # Default: Sepolia
      ;;
  esac
}

# =============================================================================
# SCRIPT PARAMETERS
# =============================================================================

NETWORK="$1"
CONTRACT_TYPE="$2"
VERIFY="$3"

if [ -z "$NETWORK" ]; then
  echo "🚀 CrossChainBank8 Deployment Script v1.0"
  echo ""
  echo "Usage: $0 <network> [contract_type] [verify]"
  echo ""
  echo "📋 Available Networks:"
  echo "  # Ethereum Networks"
  echo "  sepolia        - Ethereum Sepolia testnet"
  echo "  mainnet        - Ethereum mainnet"
  echo "  # Binance Smart Chain Networks"
  echo "  bsc_testnet    - BSC testnet"
  echo "  bsc_mainnet    - BSC mainnet"
  echo "  # BASE Networks"
  echo "  base_testnet   - BASE Sepolia testnet"
  echo "  base_mainnet   - BASE mainnet"
  echo ""
  echo "📋 Contract Types:"
  echo "  all           - Deploy both vault and token (default)"
  echo "  vault         - Deploy only CrossChainBank8 vault contract"
  echo "  token         - Deploy only TestToken contract"
  echo "  verify        - Verify existing contracts (verification only)"
  echo ""
  echo "📋 Examples:"
  echo "  $0 sepolia all           # Deploy both to Sepolia"
  echo "  $0 sepolia all verify    # Deploy and verify both"
  echo "  $0 mainnet vault verify  # Deploy and verify vault only"
  echo "  $0 bsc_testnet token     # Deploy token only to BSC testnet"
  echo "  $0 base_mainnet verify   # Verify existing contracts"
  echo ""
  echo "⚙️  Configuration:"
  echo "  Fee Collector: $FEE_COLLECTOR"
  echo "  Salt: $SALT"
  echo "  Price Feed: $(getPriceFeed "$NETWORK")"
  exit 1
fi

if [ -z "$CONTRACT_TYPE" ]; then
  CONTRACT_TYPE="all"
fi

# Check if verification is requested
if [ "$CONTRACT_TYPE" = "verify" ]; then
  VERIFY="verify"
  CONTRACT_TYPE="all"
fi

# =============================================================================
# VALIDATION
# =============================================================================

# Validate network
case "$NETWORK" in
  sepolia|mainnet|bsc_testnet|bsc_mainnet|base_testnet|base_mainnet)
    echo "✅ Network: $NETWORK"
    ;;
  *)
    echo "❌ Invalid network: $NETWORK"
    echo "Available networks: sepolia, mainnet, bsc_testnet, bsc_mainnet, base_testnet, base_mainnet"
    exit 1
    ;;
esac

# Validate contract type
case "$CONTRACT_TYPE" in
  all|vault|token)
    echo "✅ Contract Type: $CONTRACT_TYPE"
    ;;
  *)
    echo "❌ Invalid contract type: $CONTRACT_TYPE"
    echo "Available types: all, vault, token"
    exit 1
    ;;
esac

# Validate verification flag
if [ "$VERIFY" = "verify" ]; then
  echo "✅ Verification: Enabled"
  if [ -z "$ETHERSCAN_API_KEY" ]; then
    echo "⚠️  Warning: ETHERSCAN_API_KEY is empty. Verification may fail."
  fi
else
  echo "✅ Verification: Disabled"
fi

# Check if required files exist
if [ ! -f "contracts/CrossChainBank8.sol" ]; then
  echo "❌ CrossChainBank8.sol not found in contracts/ directory"
  exit 1
fi

if [ ! -f "contracts/TestToken.sol" ]; then
  echo "❌ TestToken.sol not found in contracts/ directory"
  exit 1
fi

if [ ! -f "scripts/deployVault8.js" ]; then
  echo "❌ deployVault8.js not found in scripts/ directory"
  exit 1
fi

if [ ! -f "scripts/deployToken.js" ]; then
  echo "❌ deployToken.js not found in scripts/ directory"
  exit 1
fi

# =============================================================================
# ENVIRONMENT SETUP
# =============================================================================

echo ""
echo "🔧 Setting up environment..."

# Generate random salt for this deployment
SALT="$(generate_random_salt)"

# Get network configuration
PRICE_FEED="$(getPriceFeed "$NETWORK")"
RPC_URL="$(getRpcUrl "$NETWORK")"
CHAIN_ID="$(getChainId "$NETWORK")"

# Export environment variables
export FEE_COLLECTOR="$FEE_COLLECTOR"
export SALT="$SALT"
export PRICE_FEED="$PRICE_FEED"
export VITE_ANKR_ETH_TESTNET_RPC_URL="$VITE_ANKR_ETH_TESTNET_RPC_URL"
export VITE_ANKR_ETH_MAINNET_RPC_URL="$VITE_ANKR_ETH_MAINNET_RPC_URL"
export VITE_ANKR_BSC_TESTNET_RPC_URL="$VITE_ANKR_BSC_TESTNET_RPC_URL"
export VITE_ANKR_BSC_MAINNET_RPC_URL="$VITE_ANKR_BSC_MAINNET_RPC_URL"
export VITE_ANKR_BASE_TESTNET_RPC_URL="$VITE_ANKR_BASE_TESTNET_RPC_URL"
export VITE_ANKR_BASE_MAINNET_RPC_URL="$VITE_ANKR_BASE_MAINNET_RPC_URL"
export ETHERSCAN_API_KEY="$ETHERSCAN_API_KEY"
export PRIVATE_KEY="$PRIVATE_KEY"
export PRIVATE_KEY_WALLET2="$PRIVATE_KEY_WALLET2"

# Set verification flag
if [ "$VERIFY" = "verify" ]; then
  export VERIFY="true"
else
  export VERIFY=""
fi

# Display final configuration
echo "🔑 DEPLOYMENT CONFIGURATION:"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "Fee Collector: $FEE_COLLECTOR"
echo "Salt: $SALT"
echo "Price Feed: $PRICE_FEED"
echo "Network: $NETWORK"
echo "Chain ID: $CHAIN_ID"
echo "RPC URL: $RPC_URL"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

# =============================================================================
# DEPLOYMENT LOGIC
# =============================================================================

# Create deployment log
DEPLOYMENT_LOG="deployment-$(date +%Y%m%d-%H%M%S).log"
echo "📝 Deployment started at $(date)" > "$DEPLOYMENT_LOG"
echo "Network: $NETWORK" >> "$DEPLOYMENT_LOG"
echo "Contract Type: $CONTRACT_TYPE" >> "$DEPLOYMENT_LOG"
echo "Verification: $VERIFY" >> "$DEPLOYMENT_LOG"
echo "" >> "$DEPLOYMENT_LOG"

# Deploy TestToken if needed
if [ "$CONTRACT_TYPE" = "all" ] || [ "$CONTRACT_TYPE" = "token" ]; then
  echo ""
  echo "🪙 Deploying TestToken..."

  # Run token deployment
  npx hardhat run scripts/deployToken.js --network "$NETWORK" 2>&1 | tee -a "$DEPLOYMENT_LOG"

  # Extract token address from deployment output
  TOKEN_ADDRESS=$(grep "✅ TestToken deployed at:" "$DEPLOYMENT_LOG" | tail -1 | awk '{print $NF}')
  if [ -n "$TOKEN_ADDRESS" ]; then
    echo "✅ TestToken deployed: $TOKEN_ADDRESS"
    export TESTTOKEN_ADDRESS="$TOKEN_ADDRESS"
  else
    echo "❌ Failed to extract TestToken address"
    exit 1
  fi
fi

# Deploy CrossChainBank8 if needed
if [ "$CONTRACT_TYPE" = "all" ] || [ "$CONTRACT_TYPE" = "vault" ]; then
  echo ""
  echo "🏦 Deploying CrossChainBank8..."

  # Run vault deployment
  npx hardhat run scripts/deployVault8.js --network "$NETWORK" 2>&1 | tee -a "$DEPLOYMENT_LOG"

  # Extract vault address from deployment output
  VAULT_ADDRESS=$(grep "✅ CrossChainBank8 deployed at:" "$DEPLOYMENT_LOG" | tail -1 | awk '{print $NF}')
  if [ -n "$VAULT_ADDRESS" ]; then
    echo "✅ CrossChainBank8 deployed: $VAULT_ADDRESS"
    export CROSSCHAINBANK_ADDRESS="$VAULT_ADDRESS"
  else
    echo "❌ Failed to extract CrossChainBank8 address"
    exit 1
  fi
fi

# Copy ABIs and update configs
echo ""
echo "📄 Updating configuration files..."

# Create directories if they don't exist
mkdir -p src
mkdir -p backend/abis

# Copy ABI files
if [ -f "artifacts/contracts/CrossChainBank8.sol/CrossChainBank8.json" ]; then
  cp "artifacts/contracts/CrossChainBank8.sol/CrossChainBank8.json" "src/vaultAbi.json"
  cp "artifacts/contracts/CrossChainBank8.sol/CrossChainBank8.json" "backend/abis/vaultAbi.json"
  echo "✅ Vault ABI copied"
fi

if [ -f "artifacts/contracts/TestToken.sol/TestToken.json" ]; then
  cp "artifacts/contracts/TestToken.sol/TestToken.json" "src/testTokenAbi.json"
  cp "artifacts/contracts/TestToken.sol/TestToken.json" "backend/abis/testTokenAbi.json"
  echo "✅ Token ABI copied"
fi

# Update src/config.js
if [ -f "src/config.js" ]; then
  # Update vault address
  if [ -n "$CROSSCHAINBANK_ADDRESS" ]; then
    sed -i.bak "s/CROSSCHAINBANK_ADDRESS = '[^']*'/CROSSCHAINBANK_ADDRESS = '$CROSSCHAINBANK_ADDRESS'/g" src/config.js
  fi

  # Update token address
  if [ -n "$TESTTOKEN_ADDRESS" ]; then
    sed -i.bak "s/TESTTOKEN_ADDRESS = '[^']*'/TESTTOKEN_ADDRESS = '$TESTTOKEN_ADDRESS'/g" src/config.js
  fi

  # Update network
  sed -i.bak "s/NETWORK = '[^']*'/NETWORK = '$NETWORK'/g" src/config.js

  echo "✅ src/config.js updated"
fi

# Update .env file
if [ -f ".env" ]; then
  # Update vault address
  if [ -n "$CROSSCHAINBANK_ADDRESS" ]; then
    sed -i.bak "s/^CROSSCHAINBANK_ADDRESS=.*/CROSSCHAINBANK_ADDRESS=$CROSSCHAINBANK_ADDRESS/g" .env
  fi

  # Update token address
  if [ -n "$TESTTOKEN_ADDRESS" ]; then
    sed -i.bak "s/^TESTTOKEN_ADDRESS=.*/TESTTOKEN_ADDRESS=$TESTTOKEN_ADDRESS/g" .env
  fi

  echo "✅ .env file updated"
fi

# =============================================================================
# DEPLOYMENT SUMMARY
# =============================================================================

echo ""
echo "🎉 Deployment Summary"
echo "===================="
echo "Network: $NETWORK"
echo "Contract Type: $CONTRACT_TYPE"
echo "Verification: $VERIFY"
echo ""

if [ -n "$TOKEN_ADDRESS" ]; then
  echo "🪙 TestToken Address: $TOKEN_ADDRESS"
fi

if [ -n "$VAULT_ADDRESS" ]; then
  echo "🏦 CrossChainBank8 Address: $VAULT_ADDRESS"
fi

echo ""
echo "📁 Deployment log saved: $DEPLOYMENT_LOG"
echo "📄 Configuration files updated"
echo ""

# Display explorer links
if [ -n "$VAULT_ADDRESS" ]; then
  case "$NETWORK" in
    sepolia)
      echo "🌐 Vault Explorer: https://sepolia.etherscan.io/address/$VAULT_ADDRESS"
      ;;
    mainnet)
      echo "🌐 Vault Explorer: https://etherscan.io/address/$VAULT_ADDRESS"
      ;;
    bsc_testnet)
      echo "🌐 Vault Explorer: https://testnet.bscscan.com/address/$VAULT_ADDRESS"
      ;;
    bsc_mainnet)
      echo "🌐 Vault Explorer: https://bscscan.com/address/$VAULT_ADDRESS"
      ;;
    base_testnet)
      echo "🌐 Vault Explorer: https://sepolia.basescan.org/address/$VAULT_ADDRESS"
      ;;
    base_mainnet)
      echo "🌐 Vault Explorer: https://basescan.org/address/$VAULT_ADDRESS"
      ;;
  esac
fi

if [ -n "$TOKEN_ADDRESS" ]; then
  case "$NETWORK" in
    sepolia)
      echo "🌐 Token Explorer: https://sepolia.etherscan.io/address/$TOKEN_ADDRESS"
      ;;
    mainnet)
      echo "🌐 Token Explorer: https://etherscan.io/address/$TOKEN_ADDRESS"
      ;;
    bsc_testnet)
      echo "🌐 Token Explorer: https://testnet.bscscan.com/address/$TOKEN_ADDRESS"
      ;;
    bsc_mainnet)
      echo "🌐 Token Explorer: https://bscscan.com/address/$TOKEN_ADDRESS"
      ;;
    base_testnet)
      echo "🌐 Token Explorer: https://sepolia.basescan.org/address/$TOKEN_ADDRESS"
      ;;
    base_mainnet)
      echo "🌐 Token Explorer: https://basescan.org/address/$TOKEN_ADDRESS"
      ;;
  esac
fi

echo ""
echo "🔑 FINAL DEPLOYMENT CONFIGURATION:"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "Fee Collector: $FEE_COLLECTOR"
echo "Salt: $SALT"
echo "Price Feed: $PRICE_FEED"
echo "Network: $NETWORK"
echo "Chain ID: $CHAIN_ID"
echo "RPC URL: $RPC_URL"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

echo ""
echo "✅ Deployment completed successfully!"
echo "📝 Check $DEPLOYMENT_LOG for detailed deployment information"

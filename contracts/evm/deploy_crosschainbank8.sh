#!/bin/bash
set -e

# =============================================================================
# CROSSCHAINBANK8 DEPLOYMENT SCRIPT v2.0 - ENHANCED WITH VERIFICATION
# Self-contained deployment and verification script for CrossChainBank8.sol
# Supports ETH, BSC, and BASE networks with built-in contract verification
# Features: Multi-network deployment, automatic verification, cross-network verification
# =============================================================================

# Validate required environment variables
validate_env_vars() {
  local missing_vars=()

  if [ -z "$WALLET1_PRIVK" ]; then missing_vars+=("WALLET1_PRIVK"); fi
  if [ -z "$WALLET2_PRIVK" ]; then missing_vars+=("WALLET2_PRIVK"); fi
  if [ -z "$FEE_COLLECTOR" ]; then missing_vars+=("FEE_COLLECTOR"); fi
  if [ -z "$VITE_ETHERSCAN_API_KEY" ]; then missing_vars+=("VITE_ETHERSCAN_API_KEY"); fi
  if [ -z "$VITE_BSCSCAN_API_KEY" ]; then missing_vars+=("VITE_BSCSCAN_API_KEY"); fi
  if [ -z "$ETHPLORER_KEY" ]; then missing_vars+=("ETHPLORER_KEY"); fi

  if [ ${#missing_vars[@]} -gt 0 ]; then
    echo "❌ Missing required environment variables:"
    for var in "${missing_vars[@]}"; do
      echo "   - $var"
    done
    echo ""
    echo "Please ensure your .env file contains all required variables."
    exit 1
  fi
}

# Load environment variables from .env file (one directory up)
if [ -f "../.env" ]; then
  echo "📄 Loading environment variables from ../.env file..."
  # Load .env file while properly handling comments and special characters
  while IFS='=' read -r key value; do
    # Skip empty lines and comments
    [[ -z "$key" || "$key" =~ ^[[:space:]]*# ]] && continue
    # Remove leading/trailing whitespace
    key=$(echo "$key" | sed 's/^[[:space:]]*//;s/[[:space:]]*$//')
    value=$(echo "$value" | sed 's/^[[:space:]]*//;s/[[:space:]]*$//')
    # Export the variable
    export "$key=$value"
  done < ../.env
else
  echo "❌ Error: ../.env file not found!"
  echo "Please create a .env file in the project root with your actual keys"
  exit 1
fi

# Validate required environment variables
validate_env_vars

# =============================================================================
# ENVIRONMENT CONFIGURATION
# All configuration parameters are loaded from .env file
# =============================================================================

# Generate random salt for obfuscation (unique per deployment)
generate_random_salt() {
  # Generate 64-character hex string (32 bytes)
  SALT="0x$(openssl rand -hex 32)"
  echo "$SALT"
}

# Initialize salt (will be generated during deployment)
SALT=""

# =============================================================================
# VERIFICATION FUNCTIONS
# =============================================================================

# Get contract address from .env file for verification
get_contract_address_from_env() {
  local network="$1"

  case "$network" in
    sepolia)
      echo "$VITE_CTGVAULT_ETH_TESTNET_CONTRACT"
      ;;
    mainnet)
      echo "$VITE_CTGVAULT_ETH_MAINNET_CONTRACT"
      ;;
    bsc_testnet)
      echo "$VITE_CTGVAULT_BSC_TESTNET_CONTRACT"
      ;;
    bsc_mainnet)
      echo "$VITE_CTGVAULT_BSC_MAINNET_CONTRACT"
      ;;
    base_testnet)
      echo "$VITE_CTGVAULT_BASE_TESTNET_CONTRACT"
      ;;
    base_mainnet)
      echo "$VITE_CTGVAULT_BASE_MAINNET_CONTRACT"
      ;;
    *)
      echo ""
      ;;
  esac
}

# Get explorer URL for network
get_explorer_url() {
  local network="$1"
  local address="$2"

  case "$network" in
    sepolia)
      echo "https://sepolia.etherscan.io/address/$address"
      ;;
    mainnet)
      echo "https://etherscan.io/address/$address"
      ;;
    bsc_testnet)
      echo "https://testnet.bscscan.com/address/$address"
      ;;
    bsc_mainnet)
      echo "https://bscscan.com/address/$address"
      ;;
    base_testnet)
      echo "https://sepolia.basescan.org/address/$address"
      ;;
    base_mainnet)
      echo "https://basescan.org/address/$address"
      ;;
    *)
      echo "https://sepolia.etherscan.io/address/$address"
      ;;
  esac
}

# Verify a specific contract
verify_contract() {
  local network="$1"
  local contract_address="$2"
  local contract_name="$3"

  echo "🔍 Verifying $contract_name on $network..."
  echo "📍 Address: $contract_address"

  # Create temporary verification script in current directory
  cat > verify_temp_$network.js << EOF
import pkg from "hardhat";
const { ethers } = pkg;

const CONTRACT_ADDRESS = "$contract_address";
const FEE_COLLECTOR = "$FEE_COLLECTOR";
const SALT = "$SALT";
const PRICE_FEED = "$(getPriceFeed "$network")";

async function verifyContract() {
  try {
    console.log(\`Verifying $contract_name on $network\`);
    console.log(\`Contract: \${CONTRACT_ADDRESS}\`);
    console.log(\`Price Feed: \${PRICE_FEED}\`);

    await hre.run("verify:verify", {
      address: CONTRACT_ADDRESS,
      constructorArguments: [FEE_COLLECTOR, SALT, PRICE_FEED]
    });

    console.log(\`✅ Successfully verified on $network!\`);
    console.log(\`🔗 Explorer: $(get_explorer_url "$network" "$contract_address")#code\`);
    process.exit(0);
  } catch (error) {
    if (error.message.includes("Already Verified")) {
      console.log(\`✅ Contract already verified on $network!\`);
      process.exit(0);
    } else {
      console.log(\`❌ Verification failed: \${error.message.split('\\n')[0]}\`);
      process.exit(1);
    }
  }
}

verifyContract();
EOF

  # Run verification
  if npx hardhat run verify_temp_$network.js --network "$network"; then
    echo "✅ $contract_name verification successful"
    rm -f verify_temp_$network.js
    return 0
  else
    echo "❌ $contract_name verification failed"
    rm -f verify_temp_$network.js
    return 1
  fi
}

# Verify all contracts across networks
verify_all_contracts() {
  echo ""
  echo "🚀 Starting verification of all CrossChainBank8 contracts..."
  echo ""

  local total_networks=0
  local successful=0
  local failed=0

  # Networks to verify
  local networks=("sepolia" "bsc_testnet" "base_testnet")

  for network in "${networks[@]}"; do
    ((total_networks++))
    echo "🌐 Verifying contracts on $network..."

    # Verify vault contract from .env
    local vault_address=$(get_contract_address_from_env "$network")
    if [ -n "$vault_address" ] && [ "$vault_address" != "notdeployednow" ] && [ "$vault_address" != "0x0" ]; then
      if verify_contract "$network" "$vault_address" "CrossChainBank8"; then
        ((successful++))
      else
        ((failed++))
      fi
    else
      echo "   ⚠️  No deployed contract found for $network (address: $vault_address)"
    fi

    echo ""
  done

  echo "📊 VERIFICATION SUMMARY"
  echo "══════════════════════════════════════════════════"
  echo "Total Networks: $total_networks"
  echo "✅ Successful: $successful"
  echo "❌ Failed: $failed"

  if [ $failed -eq 0 ]; then
    echo ""
    echo "🎉 All contracts verified successfully across all networks!"
  else
    echo ""
    echo "⚠️  Some verifications failed. Check the logs above."
  fi
}

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
VERIFY_MODE="$4"

if [ -z "$NETWORK" ] || [ "$NETWORK" = "help" ] || [ "$NETWORK" = "--help" ] || [ "$NETWORK" = "-h" ]; then
  echo "🚀 CrossChainBank8 Deployment Script v2.0 - Enhanced with Verification"
  echo ""
  echo "Usage: $0 <network> [contract_type] [verify] [verify_mode]"
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
  echo "📋 Verification Options:"
  echo "  verify        - Verify contracts after deployment"
  echo "  verify_only   - Skip deployment, verify existing contracts only"
  echo "  verify_all    - Verify all contracts across all networks"
  echo ""
  echo "📋 Enhanced Examples:"
  echo "  # Deployment with verification"
  echo "  $0 sepolia all verify         # Deploy and verify both contracts"
  echo "  $0 mainnet vault verify       # Deploy and verify vault only"
  echo ""
  echo "  # Verification only (no deployment)"
  echo "  $0 sepolia verify_only        # Verify existing contracts on Sepolia"
  echo "  $0 bsc_testnet verify_only    # Verify existing contracts on BSC testnet"
  echo ""
  echo "  # Multi-network verification"
  echo "  $0 sepolia verify_all         # Verify contracts on all networks"
  echo "  $0 bsc_testnet verify_all     # Same as above (network ignored for verify_all)"
  echo ""
  echo "  # Legacy examples (still work)"
  echo "  $0 sepolia all                # Deploy both to Sepolia"
  echo "  $0 bsc_testnet token          # Deploy token only to BSC testnet"
  echo ""
  echo "⚙️  Configuration:"
  echo "  Fee Collector: $FEE_COLLECTOR"
  echo "  Salt: Auto-generated for each deployment"
  echo "  API Keys: Configured for all networks"
  exit 1
fi

if [ -z "$CONTRACT_TYPE" ]; then
  CONTRACT_TYPE="all"
fi

# Handle special verification modes
case "$CONTRACT_TYPE" in
  verify_only)
    VERIFY_MODE="verify_only"
    CONTRACT_TYPE="all"
    ;;
  verify_all)
    VERIFY_MODE="verify_all"
    CONTRACT_TYPE="all"
    ;;
  verify)
    VERIFY="verify"
    CONTRACT_TYPE="all"
    ;;
esac

# Handle verify_all mode
if [ "$VERIFY_MODE" = "verify_all" ]; then
  verify_all_contracts
  exit 0
fi

# Handle verify_only mode
if [ "$VERIFY_MODE" = "verify_only" ]; then
  echo "🔍 Verification only mode - skipping deployment"
  echo "🌐 Network: $NETWORK"
  echo ""

  # Verify vault contract from .env
  vault_address=$(get_contract_address_from_env "$NETWORK")
  if [ -n "$vault_address" ] && [ "$vault_address" != "notdeployednow" ] && [ "$vault_address" != "0x0" ]; then
    verify_contract "$NETWORK" "$vault_address" "CrossChainBank8"
  else
    echo "❌ No deployed vault contract found for $NETWORK (address: $vault_address)"
  fi

  echo ""
  echo "✅ Verification complete!"
  exit 0
fi

# Check if verification is requested (legacy mode)
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

# Export environment variables (map user's .env variable names to script expectations)
export FEE_COLLECTOR="$FEE_COLLECTOR"
export SALT="$SALT"
export PRICE_FEED="$PRICE_FEED"
export VITE_ANKR_ETH_TESTNET_RPC_URL="$VITE_ANKR_ETH_TESTNET_RPC_URL"
export VITE_ANKR_ETH_MAINNET_RPC_URL="$VITE_ANKR_ETH_MAINNET_RPC_URL"
export VITE_ANKR_BSC_TESTNET_RPC_URL="$VITE_ANKR_BSC_TESTNET_RPC_URL"
export VITE_ANKR_BSC_MAINNET_RPC_URL="$VITE_ANKR_BSC_MAINNET_RPC_URL"
export VITE_ANKR_BASE_TESTNET_RPC_URL="$VITE_ANKR_BASE_TESTNET_RPC_URL"
export VITE_ANKR_BASE_MAINNET_RPC_URL="$VITE_ANKR_BASE_MAINNET_RPC_URL"
export ETHERSCAN_API_KEY="$VITE_ETHERSCAN_API_KEY"
export BSCSCAN_API_KEY="$VITE_BSCSCAN_API_KEY"
export ETHPLORER_KEY="$ETHPLORER_KEY"
# Map user's wallet private keys to script expectations
export PRIVATE_KEY="$WALLET1_PRIVK"
export PRIVATE_KEY_WALLET2="$WALLET2_PRIVK"

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

# Copy ABIs to ../src/contracts/abis (one directory up from contracts/)
echo ""
echo "📄 Copying ABI files..."

# Create directories if they don't exist
mkdir -p ../src/contracts/abis

# Copy ABI files
if [ -f "artifacts/contracts/CrossChainBank8.sol/CrossChainBank8.json" ]; then
  cp "artifacts/contracts/CrossChainBank8.sol/CrossChainBank8.json" "../src/contracts/abis/vaultAbi.json"
  echo "✅ Vault ABI copied to ../src/contracts/abis/vaultAbi.json"
fi

if [ -f "artifacts/contracts/TestToken.sol/TestToken.json" ]; then
  cp "artifacts/contracts/TestToken.sol/TestToken.json" "../src/contracts/abis/testTokenAbi.json"
  echo "✅ Token ABI copied to ../src/contracts/abis/testTokenAbi.json"
fi

# Print deployment results instead of auto-updating files
echo ""
echo "📋 DEPLOYMENT RESULTS"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

# =============================================================================
# DEPLOYMENT SUMMARY
# =============================================================================

if [ -n "$TOKEN_ADDRESS" ]; then
  echo "🪙 TestToken Address: $TOKEN_ADDRESS"
fi

if [ -n "$VAULT_ADDRESS" ]; then
  echo "🏦 CrossChainBank8 Address: $VAULT_ADDRESS"
fi

echo ""
echo "📋 MANUAL UPDATE REQUIRED"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "To update your configuration files manually:"
echo ""

if [ -n "$VAULT_ADDRESS" ]; then
  case "$NETWORK" in
    sepolia)
      echo "1. Update ../.env:"
      echo "   VITE_CTGVAULT_ETH_TESTNET_CONTRACT=$VAULT_ADDRESS"
      ;;
    mainnet)
      echo "1. Update ../.env:"
      echo "   VITE_CTGVAULT_ETH_MAINNET_CONTRACT=$VAULT_ADDRESS"
      ;;
    bsc_testnet)
      echo "1. Update ../.env:"
      echo "   VITE_CTGVAULT_BSC_TESTNET_CONTRACT=$VAULT_ADDRESS"
      ;;
    bsc_mainnet)
      echo "1. Update ../.env:"
      echo "   VITE_CTGVAULT_BSC_MAINNET_CONTRACT=$VAULT_ADDRESS"
      ;;
    base_testnet)
      echo "1. Update ../.env:"
      echo "   VITE_CTGVAULT_BASE_TESTNET_CONTRACT=$VAULT_ADDRESS"
      ;;
    base_mainnet)
      echo "1. Update ../.env:"
      echo "   VITE_CTGVAULT_BASE_MAINNET_CONTRACT=$VAULT_ADDRESS"
      ;;
  esac
fi

echo ""
echo "2. ABI files copied to: ../src/contracts/abis/"
echo "   - vaultAbi.json"
echo "   - testTokenAbi.json"
echo ""

echo "📁 Deployment log saved: $DEPLOYMENT_LOG"
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
echo "✅ Deployment completed successfully!"
echo "📝 Check $DEPLOYMENT_LOG for detailed deployment information"

# =============================================================================
# POST-DEPLOYMENT VERIFICATION
# =============================================================================

# Run verification if requested
if [ "$VERIFY" = "verify" ]; then
  echo ""
  echo "🔍 Starting post-deployment verification..."
  echo ""

  local verify_success=0
  local verify_total=0

  # Verify vault contract if deployed
  if [ -n "$VAULT_ADDRESS" ]; then
    ((verify_total++))
    echo "🏦 Verifying CrossChainBank8 vault contract..."
    if verify_contract "$NETWORK" "$VAULT_ADDRESS" "CrossChainBank8"; then
      ((verify_success++))
      echo "✅ Vault verification successful"
    else
      echo "❌ Vault verification failed"
    fi
    echo ""
  fi

  # Verify token contract if deployed
  if [ -n "$TOKEN_ADDRESS" ]; then
    ((verify_total++))
    echo "🪙 Verifying TestToken contract..."
    if verify_contract "$NETWORK" "$TOKEN_ADDRESS" "TestToken"; then
      ((verify_success++))
      echo "✅ Token verification successful"
    else
      echo "❌ Token verification failed"
    fi
    echo ""
  fi

  echo "📊 VERIFICATION RESULTS"
  echo "═══════════════════════════════════════"
  echo "Verified: $verify_success/$verify_total contracts"
  echo ""

  if [ $verify_success -eq $verify_total ]; then
    echo "🎉 All contracts verified successfully!"
  else
    echo "⚠️  Some verifications failed. Check the logs above."
  fi
  echo ""
fi

echo ""
echo "✅ Deployment completed successfully!"
echo "📝 Check $DEPLOYMENT_LOG for detailed deployment information"

# Show verification reminder if verification was not requested
if [ "$VERIFY" != "verify" ] && [ "$VERIFY_MODE" != "verify_only" ] && [ "$VERIFY_MODE" != "verify_all" ]; then
  echo ""
  echo "💡 TIP: You can verify your contracts later with:"
  echo "   $0 $NETWORK verify_only     # Verify existing contracts"
  echo "   $0 $NETWORK verify_all      # Verify all contracts across networks"
fi

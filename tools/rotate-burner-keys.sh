#!/usr/bin/env bash
# tools/rotate-burner-keys.sh
#
# Rotates the two testnet burner keys after a leak.
#
# Run from the repo root:
#     bash tools/rotate-burner-keys.sh
#
# What it does:
#   1. Prompts you to paste two private keys (silent input, no echo).
#   2. Validates each is 32-byte hex, derives the public address for confirmation.
#   3. Backs up the existing tools/hardhat-deploy/.env to .env.backup.<timestamp>.
#   4. Writes:
#        SEPOLIA_PRIVATE_KEY        = 0x<wallet 1>   (covers Sepolia + BSC Testnet + Base Sepolia)
#        HYPER_TESTNET_PRIVATE_KEY  = 0x<wallet 2>   (HyperEVM testnet)
#        FEE_COLLECTOR              = <wallet 1 addr>  (receives deploy-time fees)
#      …leaving every other line in .env untouched.
#
# What it does NOT touch:
#   • cyrusthegreat/.env (the frontend env — no private keys live there)
#   • Contract addresses (those rotate via redeploy in a separate step)
#   • The OLD .env (preserved in the .backup file in case you need to recover briefly)
#
# Burner posture per workflow_rules.md Rule 10 — TESTNET ONLY. If either key
# controls mainnet funds, abort now.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
ENV_FILE="$REPO_ROOT/tools/hardhat-deploy/.env"

# Use nvm if available so ethers loads under node 22.
if [[ -f "$HOME/.nvm/nvm.sh" ]]; then
  # shellcheck disable=SC1091
  source "$HOME/.nvm/nvm.sh"
  nvm use 22.19.0 > /dev/null 2>&1 || true
fi

if [[ ! -d "$REPO_ROOT/tools/hardhat-deploy/node_modules/ethers" ]]; then
  echo "ERROR: ethers isn't installed at tools/hardhat-deploy/node_modules/ethers." >&2
  echo "Run \`cd tools/hardhat-deploy && npm install\` first, then re-run this script." >&2
  exit 1
fi

clean_key() {
  local k="${1#0x}"
  k="$(echo "$k" | tr -d '[:space:]')"
  if [[ ! "$k" =~ ^[a-fA-F0-9]{64}$ ]]; then
    return 1
  fi
  echo "$k"
}

addr_of() {
  (cd "$REPO_ROOT/tools/hardhat-deploy" && node -e "
    const { Wallet } = require('ethers');
    try { console.log(new Wallet('0x$1').address); }
    catch (e) { process.exit(2); }
  ")
}

set_env() {
  local key="$1" value="$2" file="$3"
  if grep -q "^${key}=" "$file"; then
    if [[ "$(uname)" == "Darwin" ]]; then
      sed -i '' "s|^${key}=.*|${key}=${value}|" "$file"
    else
      sed -i "s|^${key}=.*|${key}=${value}|" "$file"
    fi
  else
    echo "${key}=${value}" >> "$file"
  fi
}

echo ""
echo "============================================================"
echo "  Burner key rotation — testnet only"
echo "============================================================"
echo ""
echo "  Target file: $ENV_FILE"
echo ""
echo "  Paste each private key when prompted. Input is hidden (no echo)."
echo "  Either form is fine: 'abc123…' or '0xabc123…'."
echo ""
echo "  ⚠️  If either key controls MAINNET funds, abort now (Ctrl+C)."
echo "      These slots are testnet-only burners per Rule 10."
echo ""

echo -n "Paste WALLET 1 private key (EVM: Sepolia / BSC Testnet / Base Sepolia): "
read -rs W1_RAW
echo ""
echo -n "Paste WALLET 2 private key (HyperEVM testnet): "
read -rs W2_RAW
echo ""

W1=$(clean_key "$W1_RAW") || { echo "ERROR: wallet 1 isn't a 32-byte hex private key." >&2; exit 1; }
W2=$(clean_key "$W2_RAW") || { echo "ERROR: wallet 2 isn't a 32-byte hex private key." >&2; exit 1; }

W1_ADDR=$(addr_of "$W1") || { echo "ERROR: ethers couldn't parse wallet 1." >&2; exit 1; }
W2_ADDR=$(addr_of "$W2") || { echo "ERROR: ethers couldn't parse wallet 2." >&2; exit 1; }

if [[ "$W1_ADDR" == "$W2_ADDR" ]]; then
  echo "" >&2
  echo "ERROR: both keys derive to the same address — you probably pasted the same key twice. Aborted." >&2
  exit 1
fi

echo ""
echo "Derived addresses (sanity-check these match what your wallet shows):"
echo "  Wallet 1 (EVM):       $W1_ADDR"
echo "  Wallet 2 (HyperEVM):  $W2_ADDR"
echo ""
read -rp "Write to $ENV_FILE ? [y/N] " CONFIRM
if [[ "$CONFIRM" != "y" && "$CONFIRM" != "Y" ]]; then
  echo "Aborted. No files were changed."
  exit 1
fi

# Backup existing .env if it exists; otherwise create.
mkdir -p "$(dirname "$ENV_FILE")"
if [[ -f "$ENV_FILE" ]]; then
  TS="$(date +%Y%m%d-%H%M%S)"
  cp "$ENV_FILE" "$ENV_FILE.backup.$TS"
  echo "Backed up old env -> $ENV_FILE.backup.$TS"
else
  touch "$ENV_FILE"
fi

set_env "SEPOLIA_PRIVATE_KEY"       "0x$W1"     "$ENV_FILE"
set_env "HYPER_TESTNET_PRIVATE_KEY" "0x$W2"     "$ENV_FILE"
set_env "FEE_COLLECTOR"             "$W1_ADDR"  "$ENV_FILE"

# Best-effort clearing.
unset W1 W2 W1_RAW W2_RAW || true

echo ""
echo "✅ Keys rotated."
echo ""
echo "What this script did NOT touch:"
echo "  • cyrusthegreat/.env (frontend — no private keys live there)"
echo "  • Old contract addresses (those rotate via the redeploy step)"
echo "  • Old .env backed up at .env.backup.<timestamp>"
echo ""
echo "Next steps:"
echo "  1. Delete the OLD keys from your wallet / password manager / notes."
echo "     Treat the old addresses as burned."
echo "  2. Fund these new addresses from public faucets:"
echo "       $W1_ADDR"
echo "         → Sepolia faucet, BSC Testnet faucet, Base Sepolia faucet"
echo "       $W2_ADDR"
echo "         → HyperEVM testnet faucet"
echo "  3. Tell me when funded — I'll run the redeploys on all 4 testnets,"
echo "     then update the frontend env and prepare ctg-sync-env."
echo ""

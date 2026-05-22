#!/usr/bin/env bash
# tools/sync-deploy-keys-to-frontend.sh
#
# Companion to tools/rotate-burner-keys.sh. After rotating, this propagates
# the new key material from tools/hardhat-deploy/.env into cyrusthegreat/.env
# (the frontend env), updating:
#   WALLET1_PRIVK   = SEPOLIA_PRIVATE_KEY        (used by tests + Bank8 deploy shell)
#   WALLET2_PRIVK   = HYPER_TESTNET_PRIVATE_KEY
#   WALLET1_PUBK    = address derived from wallet 1
#   WALLET2_PUBK    = address derived from wallet 2
#   FEE_COLLECTOR   = address of wallet 1
#
# Backs up cyrusthegreat/.env before writing. No private keys are echoed.
#
# Run from repo root:
#     bash tools/sync-deploy-keys-to-frontend.sh

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
HARDHAT_ENV="$REPO_ROOT/tools/hardhat-deploy/.env"
FRONTEND_ENV="$REPO_ROOT/.env"

if [[ ! -f "$HARDHAT_ENV" ]]; then
  echo "ERROR: $HARDHAT_ENV not found. Run rotate-burner-keys.sh first." >&2
  exit 1
fi
if [[ ! -f "$FRONTEND_ENV" ]]; then
  echo "ERROR: $FRONTEND_ENV not found." >&2
  exit 1
fi

# Use nvm if available
if [[ -f "$HOME/.nvm/nvm.sh" ]]; then
  # shellcheck disable=SC1091
  source "$HOME/.nvm/nvm.sh"
  nvm use 22.19.0 > /dev/null 2>&1 || true
fi

if [[ ! -d "$REPO_ROOT/tools/hardhat-deploy/node_modules/ethers" ]]; then
  echo "ERROR: ethers not installed. Run \`cd tools/hardhat-deploy && npm install\` first." >&2
  exit 1
fi

# Pull keys out of the hardhat env (without echoing them).
W1_KEY=$(grep -E '^SEPOLIA_PRIVATE_KEY=' "$HARDHAT_ENV" | head -1 | cut -d= -f2-)
W2_KEY=$(grep -E '^HYPER_TESTNET_PRIVATE_KEY=' "$HARDHAT_ENV" | head -1 | cut -d= -f2-)

if [[ -z "$W1_KEY" || -z "$W2_KEY" ]]; then
  echo "ERROR: SEPOLIA_PRIVATE_KEY or HYPER_TESTNET_PRIVATE_KEY missing in $HARDHAT_ENV" >&2
  exit 1
fi

addr_of() {
  (cd "$REPO_ROOT/tools/hardhat-deploy" && node -e "
    const { Wallet } = require('ethers');
    try { console.log(new Wallet(process.argv[1]).address); }
    catch (e) { process.exit(2); }
  " "$1")
}

W1_ADDR=$(addr_of "$W1_KEY") || { echo "ERROR: couldn't derive wallet 1 address" >&2; exit 1; }
W2_ADDR=$(addr_of "$W2_KEY") || { echo "ERROR: couldn't derive wallet 2 address" >&2; exit 1; }

echo ""
echo "Source (tools/hardhat-deploy/.env):"
echo "  Wallet 1: $W1_ADDR"
echo "  Wallet 2: $W2_ADDR"
echo ""
echo "Target: $FRONTEND_ENV"
echo "Will update WALLET1_PRIVK, WALLET2_PRIVK, WALLET1_PUBK, WALLET2_PUBK, FEE_COLLECTOR."
echo ""
read -rp "Proceed? [y/N] " CONFIRM
if [[ "$CONFIRM" != "y" && "$CONFIRM" != "Y" ]]; then
  echo "Aborted."
  exit 1
fi

# Backup frontend .env
TS="$(date +%Y%m%d-%H%M%S)"
cp "$FRONTEND_ENV" "$FRONTEND_ENV.backup.$TS"
echo "Backed up: $FRONTEND_ENV.backup.$TS"

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

set_env "WALLET1_PRIVK"  "$W1_KEY"   "$FRONTEND_ENV"
set_env "WALLET2_PRIVK"  "$W2_KEY"   "$FRONTEND_ENV"
set_env "WALLET1_PUBK"   "$W1_ADDR"  "$FRONTEND_ENV"
set_env "WALLET2_PUBK"   "$W2_ADDR"  "$FRONTEND_ENV"
set_env "FEE_COLLECTOR"  "$W1_ADDR"  "$FRONTEND_ENV"

unset W1_KEY W2_KEY || true

echo ""
echo "✅ Frontend .env updated."
echo ""
echo "Note: ctg-sync-env only pushes VITE_* vars to Cloudflare — these wallet"
echo "variables stay LOCAL on your machine (gitignored). Good for testnet."

#!/bin/zsh
# Run a hardhat (or any) command with the deployer key injected from `pass`.
#
# WHY: the deployer private key used to sit in plaintext in this directory's
# .env. That file is gitignored, but plaintext on disk still leaks through
# editor local-history, backups and chat transcripts — which is exactly how the
# previous generation of keys ended up in ~12 places on this laptop. `pass`
# keeps the key GPG-encrypted, so reading it produces a visible passphrase /
# Touch-ID prompt instead of a silent read by any local process.
#
# USAGE
#   ./with-secrets.sh npx hardhat run scripts/deployCyrusTresor1.ts --network sepolia
#   ./with-secrets.sh npx hardhat run scripts/verify.ts --network baseSepolia
#
# The key lives ONLY in this process's environment, never on disk.
# Interactive use only — a headless/cron job cannot answer the GPG prompt.

set -euo pipefail

# Which pass entry holds the deployer key, and which address it must resolve to,
# are LOCAL facts — they name this machine's key store, so they stay out of the
# public repo. Set them in .deploy-local (gitignored) or as env vars.
#   cat > tools/hardhat-deploy/.deploy-local <<'EOF'
#   CYRUS_DEPLOY_KEY_ENTRY=<your-pass-entry>
#   CYRUS_DEPLOY_ADDR=0x<your-deployer-address>
#   EOF
LOCAL_CFG="$(cd "$(dirname "$0")" && pwd)/.deploy-local"
if [ -f "$LOCAL_CFG" ]; then set -a; . "$LOCAL_CFG"; set +a; fi

PASS_ENTRY="${CYRUS_DEPLOY_KEY_ENTRY:-}"
EXPECT_ADDR="${CYRUS_DEPLOY_ADDR:-}"

if [ -z "$PASS_ENTRY" ] || [ -z "$EXPECT_ADDR" ]; then
  echo "error: CYRUS_DEPLOY_KEY_ENTRY and CYRUS_DEPLOY_ADDR must be set" >&2
  echo "       (create $LOCAL_CFG — see the comment at the top of this script)" >&2
  exit 64
fi

if [ $# -eq 0 ]; then
  echo "usage: $0 <command> [args…]" >&2
  exit 64
fi

command -v pass >/dev/null || { echo "error: 'pass' is not installed" >&2; exit 69; }

key=$(pass show "$PASS_ENTRY" 2>/dev/null | head -1 | tr -d '[:space:]') || true
if [ -z "${key:-}" ]; then
  echo "error: could not read $PASS_ENTRY from pass (GPG unlocked?)" >&2
  exit 77
fi
case "$key" in 0x*) : ;; *) key="0x$key" ;; esac

# Fail closed: refuse to run if the key is not the wallet we expect. Guards
# against a renamed/rotated pass entry silently deploying from the wrong (or a
# burned) wallet.
if command -v cast >/dev/null; then
  got=$(cast wallet address --private-key "$key" 2>/dev/null || echo "")
  if [ "${got:l}" != "${EXPECT_ADDR:l}" ]; then
    echo "error: $PASS_ENTRY resolves to ${got:-<none>}, expected $EXPECT_ADDR" >&2
    echo "       refusing to run. Set CYRUS_DEPLOY_ADDR if this change is intended." >&2
    exit 78
  fi
  echo "deployer: $got (from $PASS_ENTRY)" >&2
fi

export SEPOLIA_PRIVATE_KEY="$key"
unset key
exec "$@"

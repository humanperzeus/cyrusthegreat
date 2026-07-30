#!/bin/zsh
# Rotate the Alchemy API key across .env.
#
# The key appears in 11 places: VITE_ALCHEMY_API_KEY plus 10 RPC-URL vars that
# embed it inside the URL. Miss one and that chain silently keeps calling the
# old (revoked) key.
#
# Do NOT match those vars by name: one of them is VITE_ALCHEMY_SOLANA_TESTNET_RPC
# with no _URL suffix, so a `VITE_ALCHEMY_*_RPC_URL` filter silently skips it.
# This script substitutes on the key VALUE instead, which is naming-agnostic,
# and refuses to write unless the replacement count matches exactly.
#
# NOTE ON SECRECY: VITE_-prefixed vars are baked into the client bundle by Vite,
# so this key is served to every visitor. It is public-by-design, like a Supabase
# anon key. Rotating does NOT make it secret — protect it with a domain allowlist
# and a spend cap in the Alchemy dashboard. The hidden prompt below is hygiene
# (keeps it out of shell history), not confidentiality.
#
# Run:  ./tools/rotate-alchemy-key.sh

set -euo pipefail
cd "$(dirname "$0")/.."
ENVF=.env
[ -f "$ENVF" ] || { echo "no .env here ($PWD)"; exit 1; }

OLD=$(command grep -E '^VITE_ALCHEMY_API_KEY=' "$ENVF" | head -1 | cut -d= -f2- | tr -d '"'"'"'' | tr -d '[:space:]')
[ -n "$OLD" ] || { echo "VITE_ALCHEMY_API_KEY not found or empty in .env"; exit 1; }

before=$(command grep -cF "$OLD" "$ENVF" || true)
echo "current key occurrences in .env: $before  (expect 10)"

printf 'New Alchemy API key: '
read -rs NEW
echo
[ -n "$NEW" ] || { echo "empty input, aborting"; exit 1; }
[ "$NEW" != "$OLD" ] || { echo "that is the SAME key as the current one, aborting"; exit 1; }
if [ ${#NEW} -lt 16 ]; then echo "that looks too short (${#NEW} chars), aborting"; exit 1; fi

cp "$ENVF" "$ENVF.rotate-bak"
python3 - "$OLD" "$NEW" <<'PY'
import sys, pathlib
old, new = sys.argv[1], sys.argv[2]
p = pathlib.Path(".env")
t = p.read_text()
p.write_text(t.replace(old, new))
PY

after_new=$(command grep -cF "$NEW" "$ENVF" || true)
after_old=$(command grep -cF "$OLD" "$ENVF" || true)
echo "after rotation: new key in $after_new place(s), old key in $after_old place(s)"

if [ "$after_new" -ne "$before" ] || [ "$after_old" -ne 0 ]; then
  echo "!! mismatch - restoring .env from backup, nothing changed"
  mv "$ENVF.rotate-bak" "$ENVF"
  exit 1
fi

printf '%s\naddress: n/a (API key)\nrole: Alchemy RPC key - PUBLIC BY DESIGN, ships in the client bundle\nprotect-with: domain allowlist + spend cap in the Alchemy dashboard\nrotated: %s\n' \
  "$NEW" "$(date +%Y-%m-%d)" | pass insert -m -f cyrus/alchemy-api-key-public >/dev/null
echo "recorded in pass: cyrus/alchemy-api-key-public"

rm -f "$ENVF.rotate-bak"
unset NEW OLD
echo
echo "done. Now tell Claude: 'alchemy rotated' — it will rebuild, redeploy and verify at the edge."

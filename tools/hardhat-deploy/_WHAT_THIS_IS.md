# hardhat-deploy — compile + deploy pipeline for cyrusthegreat contracts

## What this is

Hardhat workspace that compiles the canonical Solidity contracts at
`cyrusthegreat/contracts/evm/` and (in future commits) deploys them
to Sepolia / BSC Testnet / Base Sepolia.

**Lineage:** was previously at `CYRUS/tools/hardhat-deploy/` (outside any
git repo), itself a rescue of `CYRUS/ctg_1/hardhat/` from the August 2025
project rename. Moved into `cyrusthegreat/tools/hardhat-deploy/` on
2026-05-14 so it's versioned alongside the contracts it builds.

## How the setup works (post-2026-05-14 rework)

1. **Source location:** contracts live at `cyrusthegreat/contracts/evm/`
   (NOT duplicated under this dir).
2. **`hardhat.config.ts`** sets `paths.root = "../../"` so hardhat treats
   the repo root as the project root. This is the only way to satisfy
   hardhat 2.x's HH1007 check (refuses sources outside project root) when
   using a canonical-location source layout.
3. **Solidity deps** (`@openzeppelin/contracts@^4.9.6`, `@chainlink/contracts@^1.2.0`)
   are listed in `cyrusthegreat/package.json` devDependencies so they
   install at the repo root's `node_modules/` where hardhat looks for
   library imports. They're tree-shaken from the frontend bundle by Vite.
4. **Hardhat-specific deps** (`hardhat`, `@nomicfoundation/hardhat-toolbox`,
   `dotenv`) live in `tools/hardhat-deploy/package.json` so they don't
   pollute the frontend's devDependencies.
5. **Build artifacts** (`artifacts/`, `cache/`, `typechain-types/`,
   `node_modules/`) are all gitignored.

## How to use

**One-time setup** (per fresh clone):
```bash
# From the repo root:
nvm use 22.19.0                   # macOS bundled node breaks native modules — see L-002
npm install                       # installs @openzeppelin + @chainlink at repo root

# In this dir:
cd tools/hardhat-deploy
npm install                       # installs hardhat + plugins here
```

**Compile** (anytime contracts change):
```bash
nvm use 22.19.0
cd tools/hardhat-deploy
npx hardhat compile
# Produces artifacts/contracts/evm/<Contract>.sol/<Contract>.json
```

**Dry-run a deploy** (estimate gas, don't submit):
```bash
nvm use 22.19.0
cd tools/hardhat-deploy
DRY_RUN=1 npx hardhat run scripts/deployCyrusTresor1.ts --network sepolia
```

**Deploy** (costs gas — only when ready):
```bash
nvm use 22.19.0
cd tools/hardhat-deploy
npx hardhat run scripts/deployCyrusTresor1.ts --network sepolia
# Submits one tx (the constructor call). Writes a JSON deployment record
# to tools/hardhat-deploy/deployments/cyrustresor1-<network>.json. Logs the
# deployed address + tx hash.
```

**Verify source on the block explorer** (after deploy, optional):
```bash
nvm use 22.19.0
cd tools/hardhat-deploy
npx hardhat run scripts/verify.ts --network sepolia
# Reads the deployment record from deployments/ and submits constructor
# args to Etherscan/BSCScan/BaseScan. Idempotent.
```

## Required `.env` file (gitignored)

Create `tools/hardhat-deploy/.env`:
```
SEPOLIA_RPC_URL=https://eth-sepolia.g.alchemy.com/v2/<your-key>
BSC_TESTNET_RPC_URL=...
BASE_SEPOLIA_RPC_URL=...
SEPOLIA_PRIVATE_KEY=0x...               # forever-Sepolia-only burner per L-008 / Rule 10
ETHERSCAN_API_KEY=...
BSCSCAN_API_KEY=...
BASESCAN_API_KEY=...
```

The deployer privkey is **Sepolia-only by policy** (workflow_rules.md
Rule 10). Never use it on a chain that holds real value.

## State as of 2026-05-14

- ✅ Compile pipeline works. `npx hardhat compile` produces ABI +
  bytecode for CrossChainBank8, CyrusTresor1, TestToken.
- ✅ Bytecode sanity: CyrusTresor1 = ~13.2 KB, Bank8 = ~10.5 KB,
  TestToken = small. All well under the 24,576-byte EIP-170 cap.
- ✅ Deploy script `scripts/deployCyrusTresor1.ts` — supports sepolia,
  bscTestnet, baseSepolia. DRY_RUN=1 mode for gas estimation without
  submitting. Per-chain price feeds + pool token + bucket schedules
  hardcoded per spec § 5. Writes deployment record to deployments/.
- ✅ Verification helper `scripts/verify.ts` — reloads constructor
  args from deployment record + submits to block explorer via
  hardhat-verify. Idempotent.
- ✅ `.env.example` documenting required env vars.
- ❌ User-local `.env` not in repo (gitignored). User creates it before
  first deploy.
- ❌ Not yet deployed anywhere. Live cyrusthegreat.dev still serves
  Bank8 — unchanged.

## What was removed in the 2026-05-14 rework

- `contracts/CrossChainBank4.sol`, `contracts/TestToken.sol` — stale Bank4-era
  duplicates of contracts that now live canonically at `cyrusthegreat/contracts/evm/`
- `scripts/deployVault4.js`, `scripts/deployToken.js` — Bank4-specific
  deploy scripts with hardcoded contract names
- `deploy_contracts4.sh` — wrapper script that assumed a pnpm monorepo
  layout (`pnpm -F hardhat exec`) and wrote ABIs to `./frontend/src/abis`
  and `./backend/abis` (both directories no longer exist; the post-rename
  layout has the frontend at `cyrusthegreat/src/`).
- `ignition/` — empty unused dir.

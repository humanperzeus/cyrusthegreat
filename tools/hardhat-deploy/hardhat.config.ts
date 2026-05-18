// tools/hardhat-deploy/hardhat.config.ts
//
// This config points `paths.sources` at the canonical contract directory
// (`cyrusthegreat/contracts/evm/`) so contracts are NOT duplicated under
// `tools/hardhat-deploy/contracts/`. Single source of truth — change a
// contract once, hardhat picks it up.
//
// Networks read RPC URLs + private keys from environment variables. Set
// them via `.env` in this directory (gitignored) or via shell exports.

import { HardhatUserConfig } from "hardhat/config";
import "@nomicfoundation/hardhat-toolbox";
import "dotenv/config";

const {
  SEPOLIA_RPC_URL = "",
  BSC_TESTNET_RPC_URL = "",
  BASE_SEPOLIA_RPC_URL = "",
  HYPER_TESTNET_RPC_URL = "https://rpc.hyperliquid-testnet.xyz/evm",
  SEPOLIA_PRIVATE_KEY = "",                  // deployer privkey (testnet-only burner per Rule 10)
  HYPER_TESTNET_PRIVATE_KEY = "",            // optional dedicated HyperEVM burner (separate from Sepolia)
  ETHERSCAN_API_KEY = "",
  BSCSCAN_API_KEY = "",
  BASESCAN_API_KEY = "",
} = process.env;

const accounts = SEPOLIA_PRIVATE_KEY ? [SEPOLIA_PRIVATE_KEY] : [];
// HyperEVM accepts a SEPARATE burner if HYPER_TESTNET_PRIVATE_KEY is set,
// otherwise falls back to the shared Sepolia burner. Either way: testnet-only.
const hyperAccounts = HYPER_TESTNET_PRIVATE_KEY
  ? [HYPER_TESTNET_PRIVATE_KEY]
  : accounts;

const config: HardhatUserConfig = {
  // Bumped to 0.8.27 to safely cover CyrusTresor1's pragma ^0.8.20 (Bank8 base
  // + pool layer). The compiler accepts any ^0.8.20 contracts with 0.8.x ≥ 0.8.20.
  solidity: {
    version: "0.8.27",
    settings: {
      optimizer: { enabled: true, runs: 200 },
    },
  },

  paths: {
    // We set `root` to the repo root so hardhat treats canonical contracts
    // as INSIDE the project (HH1007 otherwise — hardhat refuses sources
    // outside its project tree, even via symlink).
    // - root      = cyrusthegreat/ (the repo)
    // - sources   = cyrusthegreat/contracts/evm/
    // - artifacts = cyrusthegreat/tools/hardhat-deploy/artifacts/  (gitignored)
    // - cache     = cyrusthegreat/tools/hardhat-deploy/cache/      (gitignored)
    root: "../../",
    sources: "contracts/evm",
    artifacts: "tools/hardhat-deploy/artifacts",
    cache: "tools/hardhat-deploy/cache",
  },

  networks: {
    sepolia: {
      url: SEPOLIA_RPC_URL,
      accounts,
      chainId: 11155111,
    },
    bscTestnet: {
      url: BSC_TESTNET_RPC_URL,
      accounts,
      chainId: 97,
    },
    baseSepolia: {
      url: BASE_SEPOLIA_RPC_URL,
      accounts,
      chainId: 84532,
    },
    // HyperEVM Testnet (Hyperliquid). No Chainlink HYPE/USD feed exists on this
    // chain yet, so deploys use a MockV3Aggregator from contracts/evm/mocks/ —
    // deployed via scripts/deployMockPriceFeed.ts ahead of CyrusTresor1.
    // Block explorer: https://testnet.purrsec.com/
    hyperEvmTestnet: {
      url: HYPER_TESTNET_RPC_URL,
      accounts: hyperAccounts,
      chainId: 998,
    },
  },

  // Etherscan API v2 (chainid-based, single key covers ETH/Base/Optimism/etc.).
  // The free-tier v2 key does NOT cover BSC — BSCScan still needs its own key,
  // and even then BSC's verify path may require a different config (P2 backlog).
  // Per the deprecation notice in hardhat-verify, the apiKey field is now a
  // top-level string, not a per-network object (was the v1 format).
  etherscan: {
    apiKey: ETHERSCAN_API_KEY,
  },

  // Keep typechain output under tools/hardhat-deploy/ alongside other hardhat
  // build artifacts. Default would be <root>/typechain-types = repo root.
  typechain: {
    outDir: "tools/hardhat-deploy/typechain-types",
    target: "ethers-v6",
  },
};

export default config;

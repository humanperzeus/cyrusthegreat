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
  SEPOLIA_PRIVATE_KEY = "",                  // deployer privkey (Sepolia-only — see workflow_rules.md Rule 10)
  ETHERSCAN_API_KEY = "",
  BSCSCAN_API_KEY = "",
  BASESCAN_API_KEY = "",
} = process.env;

const accounts = SEPOLIA_PRIVATE_KEY ? [SEPOLIA_PRIVATE_KEY] : [];

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
  },

  etherscan: {
    apiKey: {
      sepolia: ETHERSCAN_API_KEY,
      bscTestnet: BSCSCAN_API_KEY,
      baseSepolia: BASESCAN_API_KEY,
    },
  },

  // Keep typechain output under tools/hardhat-deploy/ alongside other hardhat
  // build artifacts. Default would be <root>/typechain-types = repo root.
  typechain: {
    outDir: "tools/hardhat-deploy/typechain-types",
    target: "ethers-v6",
  },
};

export default config;

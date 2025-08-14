// src/config/web3.ts
import vaultAbiJson from '../contracts/abis/vaultAbi.json';

export const WEB3_CONFIG = {
  REOWN_PROJECT_ID: import.meta.env.VITE_REOWN_PROJECT_ID,
  CTGVAULT_ADDRESS_ETH: import.meta.env.VITE_CTGVAULT_ADDRESS_ETH,
  CTGVAULT_ADDRESS_BSC: import.meta.env.VITE_CTGVAULT_ADDRESS_BSC,
  ANKR_API_KEY: import.meta.env.VITE_ANKR_API_KEY,
  ANKR_SEPOLIA_RPC_URL: import.meta.env.VITE_ANKR_SEPOLIA_RPC_URL,
  ALCHEMY_API_KEY: import.meta.env.VITE_ALCHEMY_API_KEY,
  ALCHEMY_SEPOLIA_RPC_URL: import.meta.env.VITE_ALCHEMY_SEPOLIA_RPC_URL,
  ETHERSCAN_API_KEY: import.meta.env.VITE_ETHERSCAN_API_KEY,
  ETHERSCAN_API_URL: import.meta.env.VITE_ETHERSCAN_API_URL,
} as const;

// Load vault ABI
export const VAULT_ABI = vaultAbiJson.abi;
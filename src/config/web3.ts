// Cyrus The Great Vault Configuration
// Dynamic network configuration based on VITE_NETWORK_MODE

import vaultAbiJson from '../contracts/abis/vaultAbi.json';

export const WEB3_CONFIG = {
  // Network Mode (mainnet or testnet)
  NETWORK_MODE: import.meta.env.VITE_NETWORK_MODE || 'testnet',
  
  // Reown Project ID
  REOWN_PROJECT_ID: import.meta.env.VITE_REOWN_PROJECT_ID,
  
  // Contract Addresses
  CTGVAULT_ETH_CONTRACT: import.meta.env.VITE_NETWORK_MODE === 'mainnet' 
    ? import.meta.env.VITE_CTGVAULT_ETH_MAINNET_CONTRACT
    : import.meta.env.VITE_CTGVAULT_ETH_TESTNET_CONTRACT,
    
  CTGVAULT_BSC_CONTRACT: import.meta.env.VITE_NETWORK_MODE === 'mainnet'
    ? import.meta.env.VITE_CTGVAULT_BSC_MAINNET_CONTRACT
    : import.meta.env.VITE_CTGVAULT_BSC_TESTNET_CONTRACT,
  
  // Ethereum RPC URLs
  ALCHEMY_ETH_RPC_URL: import.meta.env.VITE_NETWORK_MODE === 'mainnet'
    ? import.meta.env.VITE_ALCHEMY_ETH_MAINNET_RPC_URL
    : import.meta.env.VITE_ALCHEMY_ETH_TESTNET_RPC_URL,
    
  ANKR_ETH_RPC_URL: import.meta.env.VITE_NETWORK_MODE === 'mainnet'
    ? import.meta.env.VITE_ANKR_ETH_MAINNET_RPC_URL
    : import.meta.env.VITE_ANKR_ETH_TESTNET_RPC_URL,
  
  // Binance Smart Chain RPC URLs
  ALCHEMY_BSC_RPC_URL: import.meta.env.VITE_NETWORK_MODE === 'mainnet'
    ? import.meta.env.VITE_ALCHEMY_BSC_MAINNET_RPC_URL
    : import.meta.env.VITE_ALCHEMY_BSC_TESTNET_RPC_URL,
    
  ANKR_BSC_RPC_URL: import.meta.env.VITE_NETWORK_MODE === 'mainnet'
    ? import.meta.env.VITE_ANKR_BSC_MAINNET_RPC_URL
    : import.meta.env.VITE_ANKR_BSC_TESTNET_RPC_URL,
  
  // API Keys
  ANKR_API_KEY: import.meta.env.VITE_ANKR_API_KEY,
  ALCHEMY_API_KEY: import.meta.env.VITE_ALCHEMY_API_KEY,
  ETHERSCAN_API_KEY: import.meta.env.VITE_ETHERSCAN_API_KEY,
  BSCSCAN_API_KEY: import.meta.env.VITE_BSCSCAN_API_KEY,
  
  // Etherscan URLs
  ETHERSCAN_ETH_URL: import.meta.env.VITE_ETHERSCAN_ETH_URL || 'https://etherscan.io',
  ETHERSCAN_BSC_URL: import.meta.env.VITE_ETHERSCAN_BSC_URL || 'https://bscscan.com',
} as const;

// Load vault ABI
export const VAULT_ABI = vaultAbiJson.abi;

// Helper function to get current network info
export const getCurrentNetwork = () => {
  const mode = WEB3_CONFIG.NETWORK_MODE;
  return {
    mode,
    isMainnet: mode === 'mainnet',
    isTestnet: mode === 'testnet',
    chainId: mode === 'mainnet' ? 1 : 11155111, // ETH mainnet vs Sepolia
    bscChainId: mode === 'mainnet' ? 56 : 97, // BSC mainnet vs testnet
  };
};

// Helper function to get contract address for specific chain
export const getContractAddress = (chain: 'ETH' | 'BSC') => {
  if (chain === 'ETH') {
    return WEB3_CONFIG.CTGVAULT_ETH_CONTRACT;
  }
  if (chain === 'BSC') {
    return WEB3_CONFIG.CTGVAULT_BSC_CONTRACT;
  }
  throw new Error(`Unsupported chain: ${chain}`);
};

// Helper function to get RPC URL for specific chain
export const getRpcUrl = (chain: 'ETH' | 'BSC', provider: 'ALCHEMY' | 'ANKR') => {
  if (chain === 'ETH') {
    return provider === 'ALCHEMY' ? WEB3_CONFIG.ALCHEMY_ETH_RPC_URL : WEB3_CONFIG.ANKR_ETH_RPC_URL;
  }
  if (chain === 'BSC') {
    return provider === 'ALCHEMY' ? WEB3_CONFIG.ALCHEMY_BSC_RPC_URL : WEB3_CONFIG.ANKR_BSC_RPC_URL;
  }
  throw new Error(`Unsupported chain: ${chain}`);
};

// Helper function to get Etherscan URL for specific chain
export const getEtherscanUrl = (chain: 'ETH' | 'BSC') => {
  if (chain === 'ETH') {
    return WEB3_CONFIG.ETHERSCAN_ETH_URL;
  }
  if (chain === 'BSC') {
    return WEB3_CONFIG.ETHERSCAN_BSC_URL;
  }
  throw new Error(`Unsupported chain: ${chain}`);
};